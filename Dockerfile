# JanaShakti — container image for Google Cloud Run.
# The app is a static Vite SPA: build it in a Node stage, serve it with nginx on $PORT.
#
# IMPORTANT: Vite inlines VITE_* variables at BUILD time, so the Firebase / Gemini / Maps
# config must be supplied as --build-args (these end up in the public client bundle, like
# any web app). With Cloud Build, pass them via the trigger's substitution variables — see
# cloudbuild.yaml, which maps _VITE_* substitutions to these args.

# ---------- 1. Build the SPA ----------
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_STORAGE_BUCKET
ARG VITE_FIREBASE_MESSAGING_SENDER_ID
ARG VITE_FIREBASE_APP_ID
ARG VITE_FIREBASE_MEASUREMENT_ID
ARG VITE_GEMINI_API_KEY
ARG VITE_GOOGLE_MAPS_KEY
ARG VITE_CLOUDINARY_CLOUD_NAME
ARG VITE_CLOUDINARY_UPLOAD_PRESET
ARG VITE_N8N_AI_WEBHOOK
ARG VITE_N8N_ISSUE_WEBHOOK
ARG VITE_N8N_SOCIAL_WEBHOOK
ARG VITE_N8N_AUTH_WEBHOOK
ARG VITE_N8N_ESCALATE_WEBHOOK
ENV VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID \
    VITE_FIREBASE_MEASUREMENT_ID=$VITE_FIREBASE_MEASUREMENT_ID \
    VITE_GEMINI_API_KEY=$VITE_GEMINI_API_KEY \
    VITE_GOOGLE_MAPS_KEY=$VITE_GOOGLE_MAPS_KEY \
    VITE_CLOUDINARY_CLOUD_NAME=$VITE_CLOUDINARY_CLOUD_NAME \
    VITE_CLOUDINARY_UPLOAD_PRESET=$VITE_CLOUDINARY_UPLOAD_PRESET \
    VITE_N8N_AI_WEBHOOK=$VITE_N8N_AI_WEBHOOK \
    VITE_N8N_ISSUE_WEBHOOK=$VITE_N8N_ISSUE_WEBHOOK \
    VITE_N8N_SOCIAL_WEBHOOK=$VITE_N8N_SOCIAL_WEBHOOK \
    VITE_N8N_AUTH_WEBHOOK=$VITE_N8N_AUTH_WEBHOOK \
    VITE_N8N_ESCALATE_WEBHOOK=$VITE_N8N_ESCALATE_WEBHOOK

RUN npm run build

# ---------- 2. Serve with nginx on Cloud Run's $PORT ----------
FROM nginx:1.27-alpine AS serve
# The nginx entrypoint runs envsubst over /etc/nginx/templates/*.template at startup,
# substituting ${PORT} (Cloud Run injects PORT; default 8080) into the served config.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV PORT=8080
EXPOSE 8080
