import { MONTHLY_HUNTER_CAP } from "@/lib/constants/hunter";

export function HunterUsagePanel({ monthlyUsed }: { monthlyUsed: number }) {
  const color =
    monthlyUsed >= MONTHLY_HUNTER_CAP
      ? "text-red-600"
      : monthlyUsed >= 40
        ? "text-amber-600"
        : "text-gray-700";

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3">Hunter.io Email Lookups</h2>
      <p className={`text-sm font-medium ${color}`}>
        {monthlyUsed}/{MONTHLY_HUNTER_CAP} lookups this month
      </p>
    </div>
  );
}
