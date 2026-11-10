# WWW Workspace

This is a Yarn workspace containing two packages:

## Packages

### `blog/`

Sanity CMS management for the blog content. This package handles:

- Blog content schemas
- Content management interface
- Type generation for the frontend

**Scripts:**

- `yarn workspace blog dev` - Start Sanity Studio in development mode
- `yarn workspace blog build` - Build Sanity Studio for production
- `yarn workspace blog generate` - Generate TypeScript types from schemas

### `site/`

The main website built with React, Vite, and Tailwind CSS. This package handles:

- Public website interface
- Blog post rendering
- Static site generation

**Scripts:**

- `yarn workspace site dev` - Start development server
- `yarn workspace site build` - Build for production
- `yarn workspace site preview` - Preview production build

## Workspace Scripts

From the root directory, you can run:

- `yarn dev:site` - Start the site development server
- `yarn dev:blog` - Start the blog (Sanity Studio)
- `yarn build` - Build both packages
- `yarn lint` - Lint both packages
- `yarn generate` - Generate types from Sanity schemas

## Development Workflow

1. **Content Management**: Use `yarn dev:blog` to manage blog content via Sanity Studio
2. **Website Development**: Use `yarn dev:site` to work on the frontend
3. **Type Generation**: Run `yarn generate` after making schema changes in the blog package
4. **Build**: Use `yarn build` to build both packages for production

## Getting Started

1. Install dependencies: `yarn install`
2. Start both services: `yarn dev:blog` (in one terminal) and `yarn dev:site` (in another)
3. Access Sanity Studio at the URL provided by the blog dev server
4. Access the website at the URL provided by the site dev server
