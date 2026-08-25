import { createContext, useContext } from "react";

import type { CitationReference } from "../../../../shared/citation-contract";

export interface CitationNavigationContextValue {
  citationsForMessage(index: number): CitationReference[];
  openCitation(reference: CitationReference): void;
}

export const CitationNavigationContext = createContext<
  CitationNavigationContextValue | undefined
>(undefined);

export function useCitationNavigation(): CitationNavigationContextValue | undefined {
  return useContext(CitationNavigationContext);
}
