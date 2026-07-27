"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { normalizeSupabaseErrorMessage } from "@/lib/validation/security";

interface LogoUploadProps {
  userId: string;
  companyName: string;
  currentUrl: string | null;
}

// Magic-byte signatures -- the browser-supplied File.type is client-asserted
// and easy to spoof, so the real format is checked from file content before
// upload (defense in depth on top of the `accept` attribute and Storage's
// own path-scoped RLS).
const SIGNATURES: Array<{ mime: string; bytes: number[] }> = [
  { mime: "image/png", bytes: [0x89, 0x50, 0x4e, 0x47] },
  { mime: "image/jpeg", bytes: [0xff, 0xd8, 0xff] },
  { mime: "image/webp", bytes: [0x52, 0x49, 0x46, 0x46] }, // "RIFF" (WEBP checked further below)
];

async function sniffImageType(file: File): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  for (const sig of SIGNATURES) {
    if (sig.bytes.every((byte, i) => head[i] === byte)) {
      if (sig.mime === "image/webp") {
        const marker = String.fromCharCode(head[8], head[9], head[10], head[11]);
        if (marker !== "WEBP") continue;
      }
      return sig.mime;
    }
  }
  return null;
}

export function LogoUpload({ userId, companyName, currentUrl }: LogoUploadProps) {
  const [url, setUrl] = useState<string | null>(currentUrl);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be under 2 MB");
      return;
    }

    const realType = await sniffImageType(file);
    if (!realType) {
      toast.error("File is not a recognized PNG, JPEG or WebP image");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const ext = realType === "image/png" ? "png" : realType === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("logos")
      .upload(path, file, { upsert: true, contentType: realType });

    if (uploadError) {
      toast.error(normalizeSupabaseErrorMessage(uploadError));
      setLoading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("logos").getPublicUrl(path);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ logo_url: publicUrl })
      .eq("id", userId);

    if (profileError) {
      toast.error(normalizeSupabaseErrorMessage(profileError));
    } else {
      setUrl(publicUrl + `?t=${Date.now()}`);
      toast.success("Logo updated");
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-indigo-500/20 bg-indigo-500/15">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={companyName} className="h-full w-full object-cover" />
          ) : (
            <Building2 className="h-6 w-6 text-indigo-300" />
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-[var(--color-surface-900)] bg-indigo-600 transition-colors hover:bg-indigo-500 disabled:opacity-50"
          title="Change logo"
        >
          {loading ? <Loader2 className="h-3 w-3 animate-spin text-white" /> : <Building2 className="h-3 w-3 text-white" />}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      <div>
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{companyName}</p>
        <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">Click the icon to upload your logo (max 2 MB)</p>
      </div>
    </div>
  );
}
