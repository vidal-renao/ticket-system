"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Building2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { CreateUserModal, type Team } from "@/components/admin/CreateUserModal";

interface AdminPageControlsProps {
  teams: Team[];
}

export function AdminPageControls({ teams }: AdminPageControlsProps) {
  const router = useRouter();
  const [open, setOpen]                   = useState(false);
  const [defaultType, setDefaultType]     = useState<"agent" | "customer">("agent");

  function openModal(type: "agent" | "customer") {
    setDefaultType(type);
    setOpen(true);
  }

  function handleSuccess() {
    router.refresh();
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => openModal("agent")}
        >
          <UserPlus className="w-3.5 h-3.5" />
          New Employee
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => openModal("customer")}
        >
          <Building2 className="w-3.5 h-3.5" />
          New Company
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
