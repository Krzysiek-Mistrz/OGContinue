import { useAppSelector } from "../../../redux/hooks";
import { getLocalStorage, setLocalStorage } from "../../../util/localStorage";
import { ReusableCard } from "../../ReusableCard";
import { useOnboardingCard } from "../hooks";
import OnboardingLocalTab from "../components/OnboardingLocalTab";

interface OnboardingCardProps {
  isDialog: boolean;
}

// This fork has no hosted account to log into, so onboarding goes straight
// to the local (Ollama) flow rather than a "log in to hub.continue.dev" tab.
export function PlatformOnboardingCard({ isDialog }: OnboardingCardProps) {
  const onboardingCard = useOnboardingCard();
  const config = useAppSelector((store) => store.config.config);

  if (getLocalStorage("onboardingStatus") === undefined) {
    setLocalStorage("onboardingStatus", "Started");
  }

  return (
    <ReusableCard
      showCloseButton={!isDialog && !!config.modelsByRole.chat.length}
      onClose={() => onboardingCard.close()}
    >
      <div className="flex h-full w-full items-center justify-center">
        <OnboardingLocalTab isDialog={isDialog} />
      </div>
    </ReusableCard>
  );
}
