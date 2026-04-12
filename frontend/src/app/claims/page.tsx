import { ClaimsTable } from "@/components/claims/ClaimsTable";

export default function ClaimsExplorerPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8">
      <h1 className="mb-4 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Claims Explorer
      </h1>
      <ClaimsTable />
    </div>
  );
}
