# For local testing:
# docker build -t very-naive-captcha-solver .
# docker run -it --rm --name running-captcha-solver very-naive-captcha-solver

FROM python:3

MAINTAINER Pierpaolo Tommasi "pierpaolo.tommasi@gmail.com"

RUN apt-get update -y                                                               && \
    apt-get install -y python-pip python-dev build-essential                        && \
    apt update && apt install -y libsm6 libxext6                                    && \
    apt-get -y install imagemagick tesseract-ocr


WORKDIR /app

COPY . .

RUN pip install --no-cache-dir -r requirements.txt

ENV PYTHONPATH /app
CMD [ "python", "./main.py" ]

