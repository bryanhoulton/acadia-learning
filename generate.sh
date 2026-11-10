cd api

# Generate API schema
uv run python manage.py spectacular --file ../schema.yml

# Generate TypeScript types
npx openapi-typescript ../schema.yml -o ../portal/src/types/api.ts
npx openapi-typescript ../schema.yml -o ../www/site/src/types/api.ts
npx openapi-typescript ../schema.yml -o ../mobile/types/api.ts

echo "✅ Schema generation complete!"
echo "Generated files:"
echo "  - schema.yml (API schema)"
echo "  - portal/src/types/api.ts (API types)"
echo "  - www/site/src/types/api.ts (API types)"
echo "  - mobile/types/api.ts (API types for React Native)"
echo ""
echo "Note: Block types are now defined in the frontend (portal/src/components/playground/canvas/schema.ts)"
echo "      and sent to the agent via LiveKit at runtime."
