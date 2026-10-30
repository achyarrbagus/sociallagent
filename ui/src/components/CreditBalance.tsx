import { useQuery } from "@tanstack/react-query";
import { creditsApi } from "@/api/credits";
import { Card } from "@/components/ui/card";
const formatCredits = (micro: string) => (Number(micro) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 6 });
export function CreditBalance({ companyId }: { companyId: string }) {
  const query = useQuery({ queryKey: ["credits", companyId], queryFn: () => creditsApi.balance(companyId), refetchInterval: 30_000 });
  if (query.isLoading) return <p className="text-sm text-muted-foreground">Loading credits…</p>;
  if (query.error) return <p role="alert" className="text-sm text-destructive">Could not load credits. {query.error instanceof Error ? query.error.message : "Please try again."}</p>;
  if (!query.data?.enabled) return null;
  const { allowanceMicrounits, spentMicrounits, remainingMicrounits, periodEnd, history } = query.data;
  return <Card className="block space-y-3 bg-transparent p-5">
    <div><h2 className="text-sm font-semibold">AI credits</h2><p className="text-sm text-muted-foreground">{formatCredits(remainingMicrounits)} remaining of {formatCredits(allowanceMicrounits)} monthly credits · {formatCredits(spentMicrounits)} used</p><p className="text-xs text-muted-foreground">Renews {new Date(periodEnd).toLocaleDateString(undefined, { timeZone: "UTC" })} (UTC). Tasks already running may exceed the remaining balance.</p></div>
    {history.length > 0 && <div><h3 className="text-sm font-medium">Recent usage</h3><ul className="space-y-1 text-sm text-muted-foreground">{history.slice(0, 5).map((item, index) => <li key={`${item.occurredAt}-${index}`}>{new Date(item.occurredAt).toLocaleString()} · {formatCredits(item.amountMicrounits)} credits</li>)}</ul></div>}
  </Card>;
}
