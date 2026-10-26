import {
  LoadingShell,
  SkeletonChart,
  SkeletonHeader,
  SkeletonStats,
  SkeletonTable,
} from "@/components/ui/skeleton";

export default function ReportsLoading() {
  return (
    <LoadingShell>
      <SkeletonHeader />
      <SkeletonTable rows={1} columns={4} />
      <SkeletonStats />
      <SkeletonChart />
      <div className="grid gap-5 lg:grid-cols-2">
        <SkeletonTable rows={6} columns={2} />
        <SkeletonTable rows={6} columns={2} />
      </div>
    </LoadingShell>
  );
}
