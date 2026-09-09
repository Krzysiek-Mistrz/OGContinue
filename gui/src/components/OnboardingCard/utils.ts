import { getLocalStorage, setLocalStorage } from "../../util/localStorage";

// activeTab is a leftover from upstream's multi-provider onboarding
// (Quickstart/Best/Local/hub tabs). This fork only has one flow, so it's
// kept loose-typed rather than deleted outright - HelpCenterSection still
// passes a stale value into it, which is now simply ignored.
export interface OnboardingCardState {
  show?: boolean;
  activeTab?: string;
}

// Note that there is no "NotStarted" status since the
// local storage value is null until onboarding begins
export type OnboardingStatus = "Started" | "Completed";

// If there is no value in local storage for "onboardingStatus",
// it implies that the user has not begun or completed onboarding.
export function isNewUserOnboarding() {
  // We used to use "onboardingComplete", but switched to "onboardingStatus"
  const onboardingCompleteLegacyValue =
    localStorage.getItem("onboardingComplete");

  if (onboardingCompleteLegacyValue === "true") {
    setLocalStorage("onboardingStatus", "Completed");
    localStorage.removeItem("onboardingComplete");
  }

  const onboardingStatus = getLocalStorage("onboardingStatus");

  return onboardingStatus === undefined;
}

export const defaultOnboardingCardState: OnboardingCardState = {
  show: false,
};

export enum OllamaConnectionStatuses {
  WaitingToDownload = "WaitingToDownload",
  Downloading = "Downloading",
  Connected = "Connected",
}
