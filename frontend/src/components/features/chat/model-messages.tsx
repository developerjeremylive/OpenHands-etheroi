import { Trans, useTranslation } from "react-i18next";
import { useModelStore } from "#/stores/model-store";
import { Typography } from "#/ui/typography";
import { I18nKey } from "#/i18n/declaration";
import { GenericEventMessage } from "./generic-event-message";
import { MonoComponent } from "./mono-component";
import type { LlmProfileSummary } from "#/api/settings-service/profiles-service.api";

interface ProfileRowProps {
  profile: LlmProfileSummary;
}

function ProfileRow({ profile }: ProfileRowProps) {
  return (
    <div className="border border-neutral-700 rounded-md px-2 py-1.5">
      <Typography.Text className="font-semibold text-neutral-200 text-sm">
        {profile.name}
      </Typography.Text>
      <div className="mt-1 text-xs text-neutral-300 font-mono whitespace-pre-wrap">
        {`model:    ${profile.model ?? "—"}\n` +
          `base_url: ${profile.base_url ?? "—"}`}
      </div>
    </div>
  );
}

export interface ModelMessagesProps {
  conversationId: string | null | undefined;
  /**
   * Render only entries anchored to this event id. Use `null` to render the
   * "no events at the time of /model" entries (top of the chat history).
   */
  anchorEventId: string | null;
}

export function ModelMessages({
  conversationId,
  anchorEventId,
}: ModelMessagesProps) {
  const { t } = useTranslation();
  const entriesById = useModelStore((s) => s.entriesByConversation);
  const allEntries = conversationId ? (entriesById[conversationId] ?? []) : [];
  const entries = allEntries.filter((e) => e.anchorEventId === anchorEventId);

  if (!conversationId || entries.length === 0) return null;

  return (
    <div data-testid="model-messages" className="flex flex-col w-full">
      {entries.map((entry) => {
        if (entry.switchedTo) {
          return (
            <GenericEventMessage
              key={entry.id}
              title={
                <span>
                  <Trans
                    i18nKey={I18nKey.MODEL$SWITCHED_TO_PROFILE}
                    values={{ name: entry.switchedTo }}
                    components={{ cmd: <MonoComponent /> }}
                  />
                </span>
              }
              details={null}
            />
          );
        }

        const isEmpty = entry.profiles.length === 0;
        return (
          <GenericEventMessage
            key={entry.id}
            title={
              <span>
                {isEmpty
                  ? t(I18nKey.MODEL$NO_SAVED_PROFILES)
                  : t(I18nKey.MODEL$AVAILABLE_PROFILES, {
                      count: entry.profiles.length,
                    })}
              </span>
            }
            details={
              isEmpty ? (
                <Typography.Text className="text-neutral-300 text-sm px-2 py-1">
                  {t(I18nKey.MODEL$NO_PROFILES_HINT)}
                </Typography.Text>
              ) : (
                <div className="flex flex-col gap-1 mt-1">
                  {entry.profiles.map((p) => (
                    <ProfileRow key={p.name} profile={p} />
                  ))}
                </div>
              )
            }
            initiallyExpanded={isEmpty}
          />
        );
      })}
    </div>
  );
}
