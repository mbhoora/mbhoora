FROM node:20.12.2
#RUN apt update && apt upgrade
#RUN apt add --no-cache git -y
WORKDIR /app
COPY package.json /app
RUN npm install
COPY . /app
CMD [ "npm", "run", "start"]
