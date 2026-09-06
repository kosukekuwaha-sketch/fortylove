import * as Sentry from "@sentry/nextjs";
import { scrubErrorEvent } from "@/lib/observability/sentry-privacy";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,
  sendDefaultPii: false,
  defaultIntegrations: false,
  tracesSampleRate: 0,
  beforeSend: scrubErrorEvent,
  beforeBreadcrumb: () => null,
});
