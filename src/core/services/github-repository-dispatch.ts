type RepositoryDispatchOptions = {
  dispatchRepo: string;
  token: string;
  eventType: string;
  clientPayload: Record<string, string | number | boolean | null | undefined>;
  userAgent: string;
  logLabel: string;
};

/**
 * GitHub repository_dispatch exige client_payload com valores string.
 * @see https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event
 */
export function toRepositoryDispatchClientPayload(
  payload: Record<string, string | number | boolean | null | undefined>
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined || value === null) continue;
    out[key] = String(value);
  }
  return out;
}

export async function postRepositoryDispatch(
  options: RepositoryDispatchOptions
): Promise<void> {
  const dispatchRepo = options.dispatchRepo.trim();
  const token = options.token.trim();
  const eventType = options.eventType.trim();
  const clientPayload = toRepositoryDispatchClientPayload(options.clientPayload);

  const response = await fetch(`https://api.github.com/repos/${dispatchRepo}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": options.userAgent,
    },
    body: JSON.stringify({
      event_type: eventType,
      client_payload: clientPayload,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `${options.logLabel} failed (${response.status}) for ${dispatchRepo}/${eventType}: ${body.slice(0, 500)}`
    );
  }

  console.info(
    `[themes] ${options.logLabel} dispatched`,
    JSON.stringify({
      repo: dispatchRepo,
      event_type: eventType,
      client_payload: clientPayload,
    })
  );
}
