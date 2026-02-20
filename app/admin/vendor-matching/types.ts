export interface DomainGroup {
  domain: string;
  listingCount: number;
  listingIds: string[];
  sampleNames: string[];
  isChain: boolean;
}

export interface ReadyToLink {
  domain: string;
  vendorId: number;
  vendorName: string;
  listingCount: number;
  listingIds: string[];
}

export interface NewVendorRow extends DomainGroup {
  editedName: string;
}

export interface MatchStats {
  totalUnmatched: number;
  readyToLink: number;
  newDomains: number;
  newChains: number;
  newStandalone: number;
}

export interface SessionSummary {
  vendorsLinked: number;
  vendorsCreated: number;
  listingsUpdated: number;
}
