import {
  LoadingShell,
  SkeletonChart,
  SkeletonHeader,
  SkeletonStats,
  SkeletonTable,
} from "@/components/ui/skeleton";

export default function DashboardLoading() {
  return (
    <LoadingShell>
      <SkeletonHeader />
      <SkeletonStats />
      <div className="grid gap-5 lg:grid-cols-2">
        <SkeletonChart />
        <SkeletonChart />
      </div>
      <SkeletonTable rows={5} />
    </LoadingShell>
  );
}
