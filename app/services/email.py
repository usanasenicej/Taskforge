import smtplib
from email.message import EmailMessage

import structlog

from app.config import get_settings
from app.core.telemetry import emails

logger = structlog.get_logger(__name__)

# Reserved TLDs (RFC 2606 / 6761) can never receive mail. Demo and test accounts
# use them, so we log instead of handing them to a real SMTP relay.
_UNDELIVERABLE_SUFFIXES = (".local", ".test", ".example", ".invalid", ".localhost")


def is_deliverable(address: str) -> bool:
    domain = address.rsplit("@", 1)[-1].lower()
    return not domain.endswith(_UNDELIVERABLE_SUFFIXES) and domain != "localhost"


def send_email(to_address: str, subject: str, body: str, html_body: str | None = None) -> bool:
    """Send an email. Returns True when handed to SMTP, False when skipped or failed."""
    settings = get_settings()
    if not settings.smtp_host or not is_deliverable(to_address):
        # No body: it can hold verification codes, and logs may leave this machine.
        logger.info("email_skipped", to=to_address, subject=subject)
        emails.labels(result="skipped").inc()
        return False

    message = EmailMessage()
    message["From"] = settings.smtp_from
    message["To"] = to_address
    message["Subject"] = subject
    message.set_content(body)
    if html_body:
        message.add_alternative(html_body, subtype="html")
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
            if settings.smtp_tls:
                smtp.starttls()
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(message)
    except (smtplib.SMTPException, OSError) as exc:
        logger.warning("email_send_failed", to=to_address, subject=subject, error=str(exc))
        emails.labels(result="failed").inc()
        return False
    logger.info("email_sent", to=to_address, subject=subject)
    emails.labels(result="sent").inc()
    return True
