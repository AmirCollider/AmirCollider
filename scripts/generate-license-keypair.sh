#!/usr/bin/env bash
# ==========================================
# generate-license-keypair.sh
# Makes a fresh RSA-2048 signing key for Unity DocSnap
# licences and prints both halves in the exact form each
# side needs.
#
#   private half -> `wrangler secret put DOCSNAP_LICENSE_PRIVATE_KEY`
#   public half  -> DocSnapLicenseToken.cs, PublicModulus
#
# Run this when setting up for the first time, or to rotate
# the key.
#
# ROTATING INVALIDATES EVERY LIVE TOKEN. Existing customers
# are not locked out - their KEY is unaffected, the server
# still knows their activation, and the Editor renews
# automatically within a day of being online. But any Editor
# that is offline when the change lands falls back to Free
# until it next reaches the network. Rotate when there is a
# reason to, not on a schedule.
#
# The private key is printed to your terminal and written to
# ./license-private.pem. It is not committed - see
# .gitignore - and it should not be: anybody holding it can
# mint licences for this product.
# ==========================================
set -euo pipefail

OUT_DIR="${1:-.}"
PRIV="${OUT_DIR}/license-private.pem"

if [ -f "$PRIV" ]; then
  echo "Refusing to overwrite an existing key at ${PRIV}." >&2
  echo "Move or delete it first if you really mean to rotate." >&2
  exit 1
fi

echo "Generating RSA-2048 signing key..."
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$PRIV" 2>/dev/null
chmod 600 "$PRIV"

# PKCS#8 DER, base64, one line. This is the exact shape
# licensing/tokens.js imports, and it is also what
# `wrangler secret put` wants pasted at its prompt.
PKCS8=$(openssl pkcs8 -topk8 -nocrypt -in "$PRIV" -outform DER | base64 | tr -d '\n')

# The modulus as base64url, which is the JWK "n" parameter -
# the same encoding the C# side rebuilds RSAParameters from,
# so both halves are reading identical numbers.
MODULUS=$(openssl rsa -in "$PRIV" -noout -modulus \
  | sed 's/^Modulus=//' \
  | python3 -c "import sys,base64;print(base64.urlsafe_b64encode(bytes.fromhex(sys.stdin.read().strip())).decode().rstrip('='))")

cat <<EOF

==========================================
1. THE WORKER (keep this secret)
==========================================

Run this and paste the line below it at the prompt:

  npx wrangler secret put DOCSNAP_LICENSE_PRIVATE_KEY

${PKCS8}

Also set the admin token, which guards key generation.
Any long random string; this makes one for you:

  npx wrangler secret put DOCSNAP_ADMIN_TOKEN
  $(openssl rand -base64 32)

==========================================
2. THE UNITY PACKAGE (safe to commit)
==========================================

Replace the PublicModulus literal in
Editor/UnityDocSnap/Licensing/DocSnapLicenseToken.cs with
this. PublicExponent stays "AQAB" (65537).

EOF

# Wrapped to the same 88-character segments the C# file
# already uses, so the constant stays readable in a diff.
python3 - "$MODULUS" <<'PY'
import sys
m = sys.argv[1]
width = 88
parts = [m[i:i + width] for i in range(0, len(m), width)]
print('        private const string PublicModulus =')
for index, part in enumerate(parts):
    tail = ' +' if index < len(parts) - 1 else ';'
    print('            "{}"{}'.format(part, tail))
PY

cat <<EOF

Private key written to ${PRIV} (mode 600).
Keep it out of the repository. Anybody holding it can mint
licences for this product.
EOF
