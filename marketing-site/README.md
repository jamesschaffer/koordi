# Koordie Marketing Site

This is the static marketing website for Koordie, designed to be hosted at www.koordie.com.

## Structure

```
marketing-site/
├── index.html              # Landing page
├── privacy-policy.html     # Privacy policy
├── terms-of-service.html   # Terms of service
├── css/
│   └── main.css           # Styles for all pages
├── images/
│   └── koordie.svg        # Logo
├── Dockerfile             # Container configuration
└── nginx.conf             # Nginx server configuration
```

## Features

- **Clean, Minimal Design**: Professional landing page with a focus on simplicity
- **Responsive**: Works on all device sizes
- **SEO Optimized**: Proper meta tags and semantic HTML
- **Fast Loading**: Optimized assets and gzip compression
- **Legal Pages**: Privacy Policy and Terms of Service ready for Google OAuth review

## Local Development

To test the site locally, you can use any static file server. For example:

```bash
# Using Python
cd marketing-site
python3 -m http.server 8080

# Using Node.js http-server
npx http-server -p 8080

# Using nginx with Docker
docker build -t koordie-marketing .
docker run -p 8080:8080 koordie-marketing
```

Then visit http://localhost:8080

## Deployment

The site is automatically deployed to Google Cloud Run via GitHub Actions when changes are pushed to the `main` branch.

### Manual Deployment

If you need to deploy manually:

```bash
cd marketing-site

# Build the Docker image
docker build -t us-central1-docker.pkg.dev/solar-safeguard-476315-p0/koordie-repo/marketing:latest .

# Push to Artifact Registry
docker push us-central1-docker.pkg.dev/solar-safeguard-476315-p0/koordie-repo/marketing:latest

# Deploy to Cloud Run
gcloud run deploy koordie-marketing \
  --image=us-central1-docker.pkg.dev/solar-safeguard-476315-p0/koordie-repo/marketing:latest \
  --region=us-central1 \
  --platform=managed \
  --allow-unauthenticated
```

### Domain Configuration

After deployment, you'll need to map the custom domain:

1. Get the Cloud Run service URL from the deployment output
2. In Google Cloud Console, go to Cloud Run → koordie-marketing → Manage Custom Domains
3. Add www.koordie.com as a custom domain
4. Update your DNS records with the provided values

## Contact Information

All contact information points to: james@jamesschaffer.com

This email appears in:
- Privacy Policy contact section
- Terms of Service contact section
- Footer contact link

## Google OAuth Approval

This marketing site satisfies Google's requirements for OAuth application approval:

- ✅ Functioning homepage at the main domain
- ✅ Privacy Policy accessible at /privacy-policy.html
- ✅ Terms of Service accessible at /terms-of-service.html
- ✅ Professional appearance
- ✅ Clear explanation of the service
- ✅ Contact information provided

Make sure to provide the following URLs in your Google OAuth application:
- Homepage: https://www.koordie.com
- Privacy Policy: https://www.koordie.com/privacy-policy.html
- Terms of Service: https://www.koordie.com/terms-of-service.html
