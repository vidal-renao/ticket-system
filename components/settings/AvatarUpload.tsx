"use client";

import { useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { normalizeSupabaseErrorMessage } from "@/lib/validation/security";

interface AvatarUploadProps {
  userId: string;
  name: string;
  currentUrl: string | null;
}

export function AvatarUpload({ userId, name, currentUrl }: AvatarUploadProps) {
  const [url, setUrl]       = useState<string | null>(currentUrl);
  const [loading, setLoading] = useState(false);
  const inputRef            = useRef<HTMLInputElement>(null);

  const initials = name
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB");
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const ext = file.name.split(".").pop() ?? "jpg";
    const path = `${userId}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      toast.error(normalizeSupabaseErrorMessage(uploadError));
      setLoading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);

    const { error: profileError } = await supabase
      .from("profiles")
      .update({ avatar_url: publicUrl })
      .eq("id", userId);

    if (profileError) {
      toast.error(normalizeSupabaseErrorMessage(profileError));
    } else {
      setUrl(publicUrl + `?t=${Date.now()}`);
      toast.success("Avatar updated");
    }
    setLoading(false);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative">
        <div className="w-16 h-16 rounded-full overflow-hidden bg-indigo-500/15 border border-indigo-500/20 flex items-center justify-center text-xl font-semibold text-indigo-300">
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={name} className="w-full h-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-indigo-600 border-2 border-[var(--color-surface-900)] flex items-center justify-center hover:bg-indigo-500 transition-colors disabled:opacity-50"
          title="Change avatar"
        >
          {loading
            ? <Loader2 className="w-3 h-3 text-white animate-spin" />
            : <Camera className="w-3 h-3 text-white" />
          }
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
        <p className="text-sm font-medium text-[var(--color-text-primary)]">{name}</p>
        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Click the camera icon to upload (max 2 MB)</p>
      </div>
    </div>
  );
}
