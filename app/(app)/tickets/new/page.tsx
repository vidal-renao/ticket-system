import { NewTicketForm } from "@/components/tickets/NewTicketForm";

export const metadata = { title: "New Ticket" };

export default function NewTicketPage() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)]">Submit a Request</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Describe your issue — our AI will prioritize and route it automatically.
        </p>
      </div>
      <NewTicketForm />
    </div>
  );
}
