type Props = { label: string; value: string; code: string; tone: "blue" | "teal" | "violet" | "amber" | "green"; loading: boolean; wide?: boolean };
export function KpiCard({ label, value, code, tone, loading, wide = false }: Props) {
  return <article className={`kpi-card ${wide ? "kpi-card-wide" : ""}`}><div className={`metric-code metric-${tone}`}>{code}</div><div><p>{label}</p><strong className={loading ? "value-loading" : ""}>{loading ? "—" : value}</strong></div></article>;
}
