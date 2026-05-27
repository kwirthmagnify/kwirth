import { useEffect, useState } from "react";

export function useEnvironment() {
  const [isDesktop, setIsElectron] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.indexOf(' electron/') > -1) {
      setIsElectron(true);
    }
  }, []);

  return { isDesktop, isBrowser: !isDesktop };
}