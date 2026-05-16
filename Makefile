.PHONY: dev docker-build-run

dev:
	bun run dev

# Builds the prod image and runs it locally with your personal Doppler
# token, so you can sanity-check the secret-pull + boot path on your
# laptop before pushing to k8s. Expects DOPPLER_TOKEN_MY_PERSONAL in
# your shell (a service token scoped to roomflix/prd is fine).
docker-build-run:
	docker build -t roomflix:latest .
	docker run --rm -it -p 3000:3000 -e DOPPLER_TOKEN_MY_PERSONAL=$(DOPPLER_TOKEN_MY_PERSONAL) roomflix:latest
