// The eight CISSP domains and a keyword-based matcher. Used both as the enum
// the on-device model must choose from, and as the offline fallback that picks
// domains directly from an episode's description when the model is unavailable.

export const CISSP_DOMAINS = [
  "Security and Risk Management",
  "Asset Security",
  "Security Architecture and Engineering",
  "Communication and Network Security",
  "Identity and Access Management (IAM)",
  "Security Assessment and Testing",
  "Security Operations",
  "Software Development Security",
];

const KEYWORDS = {
  "Security and Risk Management": [
    "risk", "governance", "compliance", "policy", "regulation", "gdpr", "privacy",
    "law", "legal", "ethics", "business continuity", "threat model", "framework",
    "nist", "iso 27001", "fine", "lawsuit",
  ],
  "Asset Security": [
    "data classification", "asset", "data retention", "data ownership",
    "data lifecycle", "labeling", "handling", "data leak", "data broker",
  ],
  "Security Architecture and Engineering": [
    "cryptography", "encryption", "encrypt", "cipher", "tpm", "secure design",
    "architecture", "hardware", "firmware", "key management", "pki", "hashing",
    "certificate", "quantum", "side channel", "secure boot",
  ],
  "Communication and Network Security": [
    "network", "firewall", "vpn", "dns", "tcp", "routing", "wifi", "wireless",
    "protocol", "packet", "bgp", "tls", "ddos", "segmentation", "zero trust",
    "router", "bgp", "https",
  ],
  "Identity and Access Management (IAM)": [
    "authentication", "authorization", "mfa", "2fa", "passkey", "password",
    "sso", "oauth", "saml", "identity", "credential", "access control",
    "privilege", "rbac", "biometric", "login", "session hijack",
  ],
  "Security Assessment and Testing": [
    "penetration test", "pentest", "audit", "assessment", "vulnerability scan",
    "red team", "bug bounty", "cve", "proof of concept", "disclosure",
  ],
  "Security Operations": [
    "incident", "soc", "siem", "monitoring", "logging", "forensics", "malware",
    "ransomware", "breach", "detection", "response", "backup", "patch",
    "threat intel", "botnet", "phishing", "exploit", "attack", "hack",
  ],
  "Software Development Security": [
    "software", "source code", "developer", "application security", "appsec",
    "sdlc", "api security", "supply chain", "dependency", "sql injection",
    "xss", "buffer overflow", "fuzzing", "secure coding", "npm", "open source",
  ],
};

export function domainsFor(text) {
  if (!text) return ["Security Operations"];
  const lower = text.toLowerCase();
  const matched = [];
  for (const [domain, words] of Object.entries(KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) matched.push(domain);
  }
  // Never leave the (required) domain field empty.
  return matched.length ? matched : ["Security Operations"];
}
