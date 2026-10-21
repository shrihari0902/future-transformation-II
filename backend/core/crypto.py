import base64
import hashlib
import json
from typing import Dict, Any, Tuple

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature, encode_dss_signature

from core.config import settings

BANK_PRIVATE_KEY_PATH = settings.KEYS_DIR / "bank_private.pem"
BANK_PUBLIC_KEY_PATH = settings.KEYS_DIR / "bank_public.pem"


def canonical_json_bytes(data: Dict[str, Any]) -> bytes:
    """
    Produces deterministic, canonical JSON bytes with sorted keys and no unnecessary whitespace.
    Must match browser canonicalization exactly.
    """
    return json.dumps(data, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode('utf-8')


def get_or_create_bank_keys() -> Tuple[ec.EllipticCurvePrivateKey, ec.EllipticCurvePublicKey]:
    """
    Loads bank ECDSA P-256 keypair from disk or generates a fresh pair.
    """
    if BANK_PRIVATE_KEY_PATH.exists() and BANK_PUBLIC_KEY_PATH.exists():
        with open(BANK_PRIVATE_KEY_PATH, "rb") as f:
            private_key = serialization.load_pem_private_key(f.read(), password=None)
        with open(BANK_PUBLIC_KEY_PATH, "rb") as f:
            public_key = serialization.load_pem_public_key(f.read())
        return private_key, public_key

    # Generate new ECDSA P-256 keypair
    private_key = ec.generate_private_key(ec.SECP256R1())
    public_key = private_key.public_key()

    # Save private key
    pem_priv = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    with open(BANK_PRIVATE_KEY_PATH, "wb") as f:
        f.write(pem_priv)

    # Save public key
    pem_pub = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    with open(BANK_PUBLIC_KEY_PATH, "wb") as f:
        f.write(pem_pub)

    return private_key, public_key


def get_bank_public_key_spki_b64() -> str:
    """
    Returns the Bank's public key in base64-encoded SubjectPublicKeyInfo (SPKI) DER format.
    This format can be directly imported by browser Web Crypto API via:
    crypto.subtle.importKey('spki', buffer, {name: 'ECDSA', namedCurve: 'P-256'}, true, ['verify'])
    """
    _, public_key = get_or_create_bank_keys()
    der_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.DER,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return base64.b64encode(der_bytes).decode('ascii')


def get_bank_public_key_pem() -> str:
    """
    Returns the Bank's public key in standard PEM format.
    """
    _, public_key = get_or_create_bank_keys()
    pem_bytes = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return pem_bytes.decode('ascii')


def der_to_raw_p1363(der_sig: bytes) -> bytes:
    """
    Converts ASN.1 DER ECDSA signature to IEEE P1363 64-byte raw signature (r || s).
    Browser Web Crypto produces and consumes IEEE P1363 raw 64-byte signatures.
    """
    r, s = decode_dss_signature(der_sig)
    return r.to_bytes(32, byteorder="big") + s.to_bytes(32, byteorder="big")


def raw_p1363_to_der(raw_sig: bytes) -> bytes:
    """
    Converts IEEE P1363 64-byte raw signature (r || s) to ASN.1 DER format for Python cryptography.
    If the signature is already DER (begins with 0x30), returns it as-is.
    """
    if len(raw_sig) != 64:
        return raw_sig
    r = int.from_bytes(raw_sig[:32], byteorder="big")
    s = int.from_bytes(raw_sig[32:], byteorder="big")
    return encode_dss_signature(r, s)


def sign_bank_payload(payload: Dict[str, Any]) -> str:
    """
    Signs a canonical JSON payload with the Bank's private key.
    Returns base64-encoded raw IEEE P1363 signature (64 bytes).
    """
    private_key, _ = get_or_create_bank_keys()
    data = canonical_json_bytes(payload)
    der_sig = private_key.sign(data, ec.ECDSA(hashes.SHA256()))
    raw_sig = der_to_raw_p1363(der_sig)
    return base64.b64encode(raw_sig).decode('ascii')


def verify_signature(public_key_spki_b64: str, payload: Dict[str, Any], signature_b64: str) -> bool:
    """
    Verifies an ECDSA P-256 SHA-256 signature against a public key provided in SPKI base64 format.
    Signature may be raw 64-byte IEEE P1363 or DER, base64 encoded.
    """
    try:
        der_pub = base64.b64decode(public_key_spki_b64)
        public_key = serialization.load_der_public_key(der_pub)

        sig_bytes = base64.b64decode(signature_b64)
        der_sig = raw_p1363_to_der(sig_bytes)

        data = canonical_json_bytes(payload)
        public_key.verify(der_sig, data, ec.ECDSA(hashes.SHA256()))
        return True
    except Exception:
        return False


def verify_bank_signature(payload: Dict[str, Any], signature_b64: str) -> bool:
    """
    Verifies that a payload was signed by the bank.
    """
    spki_b64 = get_bank_public_key_spki_b64()
    return verify_signature(spki_b64, payload, signature_b64)


def sha256_hex(data: bytes) -> str:
    """Computes SHA-256 hex digest of given bytes."""
    return hashlib.sha256(data).hexdigest()
