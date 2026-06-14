export function SkeletonCards() {
  return <div className="grid gap-4 md:grid-cols-4">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="skeleton h-36 shadow-soft" />)}</div>
}
