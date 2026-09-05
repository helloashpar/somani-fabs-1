FROM node:20-alpine AS build

WORKDIR /app

COPY package.json yarn.lock ./
# Emergent-only dev package: not needed for a production build.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));if(p.devDependencies)delete p.devDependencies['@emergentbase/visual-edits'];fs.writeFileSync('package.json',JSON.stringify(p,null,2));" \
    && yarn install --network-timeout 600000

COPY . .
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json'));if(p.devDependencies)delete p.devDependencies['@emergentbase/visual-edits'];fs.writeFileSync('package.json',JSON.stringify(p,null,2));"

# Empty value = the frontend calls /api on the same domain (nginx proxies it).
ARG REACT_APP_BACKEND_URL=""
ENV REACT_APP_BACKEND_URL=$REACT_APP_BACKEND_URL
ENV CI=false
ENV GENERATE_SOURCEMAP=false
RUN yarn build

FROM nginx:alpine
COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
