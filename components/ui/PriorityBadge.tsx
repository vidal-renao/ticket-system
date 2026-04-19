import { Badge } from "@/components/ui/Badge";
import { priorityColor } from "@/lib/utils";

interface PriorityBadgeProps {
  priority: string;
  label: string;
}

export function PriorityBadge({ priority, label }: PriorityBadgeProps) {
  return <Badge className={priorityColor(priority)}>{label}</Badge>;
}
