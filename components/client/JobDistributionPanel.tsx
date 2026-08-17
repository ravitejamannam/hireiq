"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  ApplyMode,
  DistributionProvider,
  JobDistributionStatus,
  ProviderConnectionStatus,
} from "@prisma/client";

import {
  closeJobDistribution,
  connectProvider,
  createJobDistribution,
  disconnectProvider,
  pauseJobDistribution,
  publishJobDistribution,
  retryJobDistribution,
} from "@/app/actions/distribution-actions";
import type { SafeProviderConnection } from "@/lib/jobs/distribution/connection-service";
import type { SafeJobDistribution } from "@/lib/jobs/distribution/distribution-service";

const PROVIDERS: Array<{
  value: DistributionProvider;
  label: string;
  live: boolean;
}> = [
  { value: "MANUAL", label: "Manual", live: false },
  { value: "LINKEDIN", label: "LinkedIn", live: false },
  { value: "INDEED", label: "Indeed", live: false },
  { value: "NAUKRI", label: "Naukri", live: false },
];

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Distribution failed.";
}

function connectionFor(
  connections: SafeProviderConnection[],
  provider: DistributionProvider,
) {
  return connections.find((row) => row.provider === provider) ?? null;
}

function distributionFor(
  distributions: SafeJobDistribution[],
  provider: DistributionProvider,
) {
  return (
    distributions.find(
      (row) => row.provider === provider && row.status !== "CLOSED",
    ) ?? null
  );
}

type JobDistributionPanelProps = {
  jobId: number;
  hasPublishedSpecification: boolean;
  isOwner: boolean;
  connections: SafeProviderConnection[];
  distributions: SafeJobDistribution[];
};

export default function JobDistributionPanel({
  jobId,
  hasPublishedSpecification,
  isOwner,
  connections,
  distributions,
}: JobDistributionPanelProps) {
  const router = useRouter();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [applyMode, setApplyMode] = useState<ApplyMode>("EXTERNAL_URL");
  const [applyUrl, setApplyUrl] = useState("");
  const [includeCompensation, setIncludeCompensation] = useState(false);
  const [selectedProvider, setSelectedProvider] =
    useState<DistributionProvider>("MANUAL");
  const [credential, setCredential] = useState("");
  const [accountId, setAccountId] = useState("");

  const selectedConnection = useMemo(
    () => connectionFor(connections, selectedProvider),
    [connections, selectedProvider],
  );
  const selectedDistribution = useMemo(
    () => distributionFor(distributions, selectedProvider),
    [distributions, selectedProvider],
  );

  function run(success: string, action: () => Promise<unknown>) {
    setErrorMessage(null);
    setSuccessMessage(null);
    startTransition(async () => {
      try {
        await action();
        setSuccessMessage(success);
        setCredential("");
        router.refresh();
      } catch (error) {
        setErrorMessage(getErrorMessage(error));
      }
    });
  }

  return (
    <section className="mt-8 rounded-xl border border-zinc-200 bg-white p-6">
      <h2 className="text-lg font-bold text-black">Distribution</h2>
      <p className="mt-2 text-sm text-zinc-600">
        Provider-neutral posting. LinkedIn, Indeed, and Naukri are unavailable
        until a later partner integration. This is not T69 database sourcing.
      </p>

      {!hasPublishedSpecification ? (
        <p className="mt-4 text-sm text-zinc-600">
          Publish a specification before distributing this requirement.
        </p>
      ) : null}

      {errorMessage ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {errorMessage}
        </div>
      ) : null}
      {successMessage ? (
        <div
          role="status"
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {successMessage}
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-medium text-black">
          Provider
          <select
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            value={selectedProvider}
            disabled={isPending}
            onChange={(event) =>
              setSelectedProvider(event.target.value as DistributionProvider)
            }
          >
            {PROVIDERS.map((provider) => (
              <option key={provider.value} value={provider.value}>
                {provider.label}
                {provider.live ? "" : " (unavailable API)"}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium text-black">
          Apply mode
          <select
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            value={applyMode}
            disabled={isPending}
            onChange={(event) => setApplyMode(event.target.value as ApplyMode)}
          >
            <option value="EXTERNAL_URL">External URL</option>
            <option value="PROVIDER_NATIVE">Provider native</option>
            <option value="HIREIQ_HOSTED">HireIQ hosted</option>
          </select>
        </label>
      </div>

      {applyMode === "EXTERNAL_URL" ? (
        <label className="mt-4 block text-sm font-medium text-black">
          Apply URL
          <input
            className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
            value={applyUrl}
            disabled={isPending}
            onChange={(event) => setApplyUrl(event.target.value)}
            placeholder="https://example.com/jobs/apply"
          />
        </label>
      ) : null}

      {applyMode === "HIREIQ_HOSTED" ? (
        <p className="mt-4 text-sm text-zinc-600">
          HireIQ generates a public apply link on publish. Candidates do not need
          an account. Resume upload is not available yet.
        </p>
      ) : null}

      <label className="mt-4 flex items-center gap-2 text-sm text-black">
        <input
          type="checkbox"
          checked={includeCompensation}
          disabled={isPending}
          onChange={(event) => setIncludeCompensation(event.target.checked)}
        />
        Include compensation on the public posting
      </label>

      <p className="mt-4 text-sm text-zinc-600">
        Connection:{" "}
        {selectedConnection?.status === ProviderConnectionStatus.ACTIVE
          ? `Active${selectedConnection.hasCredential ? " (credential stored)" : ""}`
          : selectedProvider === "MANUAL"
            ? "Not required for Manual"
            : "Not connected"}
      </p>

      {isOwner && selectedProvider !== "MANUAL" ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium text-black">
            Provider account id
            <input
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={accountId}
              disabled={isPending}
              onChange={(event) => setAccountId(event.target.value)}
            />
          </label>
          <label className="block text-sm font-medium text-black">
            Credential
            <input
              type="password"
              className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={credential}
              disabled={isPending}
              autoComplete="off"
              onChange={(event) => setCredential(event.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button
              type="button"
              disabled={isPending}
              className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-400"
              onClick={() =>
                run("Provider connected.", () =>
                  connectProvider({
                    provider: selectedProvider,
                    providerAccountId: accountId,
                    credential,
                  }),
                )
              }
            >
              Connect
            </button>
            <button
              type="button"
              disabled={isPending}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:text-zinc-400"
              onClick={() =>
                run("Provider disconnected.", () =>
                  disconnectProvider(selectedProvider),
                )
              }
            >
              Disconnect
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isPending || !hasPublishedSpecification}
          className="rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:bg-zinc-400"
          onClick={() =>
            run("Distribution created.", () =>
              createJobDistribution({
                jobId,
                provider: selectedProvider,
                applyMode,
                applyUrl,
                includeCompensation,
              }),
            )
          }
        >
          Enable
        </button>
        <button
          type="button"
          disabled={isPending || !selectedDistribution}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:text-zinc-400"
          onClick={() =>
            selectedDistribution &&
            run("Publish attempted.", () =>
              publishJobDistribution({
                jobId,
                distributionId: selectedDistribution.id,
              }),
            )
          }
        >
          Publish
        </button>
        <button
          type="button"
          disabled={isPending || !selectedDistribution}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:text-zinc-400"
          onClick={() =>
            selectedDistribution &&
            run("Retry attempted.", () =>
              retryJobDistribution({
                jobId,
                distributionId: selectedDistribution.id,
              }),
            )
          }
        >
          Retry
        </button>
        <button
          type="button"
          disabled={
            isPending ||
            selectedDistribution?.status !== JobDistributionStatus.PUBLISHED
          }
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:text-zinc-400"
          onClick={() =>
            selectedDistribution &&
            run("Paused.", () =>
              pauseJobDistribution({
                jobId,
                distributionId: selectedDistribution.id,
              }),
            )
          }
        >
          Pause
        </button>
        <button
          type="button"
          disabled={isPending || !selectedDistribution}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-black disabled:text-zinc-400"
          onClick={() =>
            selectedDistribution &&
            run("Closed.", () =>
              closeJobDistribution({
                jobId,
                distributionId: selectedDistribution.id,
              }),
            )
          }
        >
          Close
        </button>
      </div>

      {selectedDistribution ? (
        <dl className="mt-6 grid gap-3 text-sm text-zinc-600 sm:grid-cols-2">
          <div>
            <dt className="font-medium text-black">Status</dt>
            <dd className="mt-1">{selectedDistribution.status}</dd>
          </div>
          <div>
            <dt className="font-medium text-black">Pinned specification</dt>
            <dd className="mt-1">
              v{selectedDistribution.specificationVersionNumber} (id{" "}
              {selectedDistribution.jobSpecificationVersionId})
            </dd>
          </div>
          <div>
            <dt className="font-medium text-black">Apply URL snapshot</dt>
            <dd className="mt-1 break-all">
              {selectedDistribution.applyUrlSnapshot ?? "None"}
            </dd>
            {selectedDistribution.applyMode === "HIREIQ_HOSTED" &&
            selectedDistribution.applyUrlSnapshot ? (
              <button
                type="button"
                className="mt-2 rounded-lg border border-zinc-300 px-3 py-1 text-sm font-medium text-black"
                onClick={() =>
                  navigator.clipboard.writeText(
                    selectedDistribution.applyUrlSnapshot!,
                  )
                }
              >
                Copy apply URL
              </button>
            ) : null}
          </div>
          <div>
            <dt className="font-medium text-black">Latest error</dt>
            <dd className="mt-1">
              {selectedDistribution.latestAttempt?.errorMessage ?? "None"}
            </dd>
          </div>
        </dl>
      ) : (
        <p className="mt-6 text-sm text-zinc-600">
          No active distribution for this provider.
        </p>
      )}
    </section>
  );
}
