import { CheckCircle, XCircle } from "lucide-react";

async function getHealth() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/api/health`, {
      next: { revalidate: 60 },
    });
    return await res.json();
  } catch {
    return {};
  }
}

export async function HealthPanel() {
  const health = await getHealth();

  const services = [
    { key: "db", label: "Database (Neon)" },
    { key: "propublica", label: "ProPublica API" },
    { key: "resend", label: "Resend" },
  ];

  return (
    <div>
      <h2 className="text-sm font-semibold mb-3">Service Health</h2>
      <div className="space-y-2">
        {services.map(({ key, label }) => (
          <div key={key} className="flex items-center gap-2 text-sm">
            {health[key] === "ok" ? (
              <CheckCircle className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle className="h-4 w-4 text-red-400" />
            )}
            <span className={health[key] === "ok" ? "text-gray-700" : "text-red-600"}>{label}</span>
            {health[key] !== "ok" && health[key] && (
              <span className="text-xs text-red-400">({health[key]})</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
