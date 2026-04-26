import { getWeeklySendCount } from "@/lib/services/sends/resend";
import { cn } from "@/lib/utils";

const WEEKLY_CAP = 50;

export async function WeekCapIndicator() {
  let count = 0;
  try {
    count = await getWeeklySendCount();
  } catch {
    // non-critical
  }

  const color =
    count >= WEEKLY_CAP
      ? "text-red-600"
      : count >= 45
        ? "text-amber-600"
        : "text-gray-400";

  return (
    <span className={cn("text-xs", color)}>
      {count}/{WEEKLY_CAP} this week
    </span>
  );
}
