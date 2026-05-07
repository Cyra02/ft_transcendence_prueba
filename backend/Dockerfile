FROM node:20

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# solo build en producción
ARG NODE_ENV=development

RUN if [ "$NODE_ENV" = "production" ]; then npm run build; fi

EXPOSE 3000

CMD if [ "$NODE_ENV" = "development" ]; then npx ts-node-dev --respawn --transpile-only src/main.ts; else node dist/main.js; fi