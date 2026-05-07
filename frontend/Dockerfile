FROM node:20

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npm run build

# solo build en producción
ARG NODE_ENV=development
RUN if [ "$NODE_ENV" = "production" ]; then npm run build; fi

EXPOSE 5173

CMD if [ "$NODE_ENV" = "development" ]; then npm run dev -- --host; else npm run preview; fi