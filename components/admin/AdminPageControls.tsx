"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Building2, Tags } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CreateUserModal, type Team } from "@/components/admin/CreateUserModal";
import { toast } from "sonner";

interface AdminPageControlsProps {
  teams: Team[];
}

export function AdminPageControls({ teams }: AdminPageControlsProps) {
  const router = useRouter();
  const [open, setOpen]                   = useState(false);
  const [defaultType, setDefaultType]     = useState<"agent" | "customer">("agent");
  const [seeding, setSeeding]             = useState(false);

  function openModal(type: "agent" | "customer") {
    setDefaultType(type);
    setOpen(true);
  }

  function handleSuccess() {
    router.refresh();
  }

  async function handleSeedCategories() {
    setSeeding(true);
    try {
      const res = await fetch("/api/admin/seed-categories", { method: "POST" });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Seed failed"); return; }
      toast.success(`Categories seeded: ${data.results.filter((r: string) => r.endsWith("ok")).length} added`);
      router.refresh();
    } catch {
      toast.error("Seed request failed");
    } finally {
      setSeeding(false);
    }
  }

  return (
    <>
      <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => openModal("agent")}
          className="w-full whitespace-nowrap sm:w-auto"
        >
          <UserPlus className="w-3.5 h-3.5" />
          New Employee
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => openModal("customer")}
          className="w-full whitespace-nowrap sm:w-auto"
        >
          <Building2 className="w-3.5 h-3.5" />
          New Company
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={handleSeedCategories}
          disabled={seeding}
          title="Add new IT categories (Email, VPN, M365, etc.)"
          className="col-span-2 w-full whitespace-nowrap sm:w-auto"
        >
          <Tags className="w-3.5 h-3.5" />
          {seeding ? "Seeding…" : "Seed Categories"}
        </Button>
      </div>

      <CreateUserModal
        open={open}
        defaultType={defaultType}
        teams={teams}
        onClose={() => setOpen(false)}
        onSuccess={handleSuccess}
      />
    </>
  );
}
