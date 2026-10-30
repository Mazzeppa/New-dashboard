export default function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="불러오는 중">
      <div className="h-7 w-48 animate-pulse rounded bg-surface-2" />
      <div className="h-24 animate-pulse rounded-lg bg-surface-2" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-lg bg-surface-2" />
        <div className="h-48 animate-pulse rounded-lg bg-surface-2" />
      </div>
    </div>
  );
}
