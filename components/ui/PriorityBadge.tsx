import { Badge } from "@/components/ui/Badge";
import { priorityColor } from "@/lib/utils";

interface PriorityBadgeProps {
  priority: string;
  label: string;
  accentPriority?: string;
}

export function PriorityBadge({ priority, label, accentPriority }: PriorityBadgeProps) {
  return <Badge className={priorityColor(accentPriority ?? priority)}>{label}</Badge>;
}
