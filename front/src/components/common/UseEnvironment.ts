import { useEffect, useState } from "react";

export function useEnvironment() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.indexOf(' electron/') > -1) {
      setIsDesktop(true);
    }
  }, []);

  return { isDesktop, isBrowser: !isDesktop };
}