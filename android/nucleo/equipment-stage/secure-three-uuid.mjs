// Three object identifiers keep their formatter and use Web Crypto instead of Math.random.
const insecureWords = [0, 1, 2, 3].map(index => `\tconst d${index} = Math.random() * 0xffffffff | 0;`).join('\n');
const secureWords = `\tconst random = globalThis.crypto.getRandomValues(new Uint32Array(4));
\tconst d0 = random[0] | 0;
\tconst d1 = random[1] | 0;
\tconst d2 = random[2] | 0;
\tconst d3 = random[3] | 0;`;

export function withSecureThreeUUIDs(source) {
  const parts = source.split(insecureWords);
  if (parts.length !== 2) throw new Error('Expected exactly one reviewed Three UUID random-word block');
  return parts.join(secureWords);
}
