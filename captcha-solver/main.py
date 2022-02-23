from io import BytesIO
from flask_cors import CORS
from flask import Flask, jsonify, request
from tornado.wsgi import WSGIContainer
from tornado.httpserver import HTTPServer
from tornado.ioloop import IOLoop
import sys, os, base64, pytesseract

try:
    import Image
except ImportError:
    from PIL import Image

__DEFAULT_PORT__ = 4184

app = Flask(__name__)
CORS(app)

http_server = HTTPServer(WSGIContainer(app))

port = os.environ['PORT'] if 'PORT' in os.environ else __DEFAULT_PORT__
http_server.listen(port)
print(f"[i] Captcha solver server started at {port}.")

def resolve(im_b64):

	# with open(path, "rb") as f:
	# 	im_b64 = base64.b64encode(f.read())

	img = Image.open(BytesIO(base64.b64decode(im_b64)))
	return pytesseract.image_to_string(img)


# if __name__=="__main__":
# 	print('Resolving Captcha')
# 	captcha_text = resolve("Captcha_1.jpg")
# 	print('Extracted Text',captcha_text)


@app.route('/solve', methods=['POST'])
def solveCaptcha():
	payload = request.get_json()
	return jsonify({ "solution": resolve(payload["data"]).strip() })


try:
    IOLoop.instance().start()
except (KeyboardInterrupt, SystemExit):
    # http://cowsay.morecode.org/
    print("""
          ________
        < Goodbye! >
          --------
                 \   ^__^ 
                  \  (oo)\_______
                     (__)\       )\/\ 
                         ||----w |
                         ||     ||
    """)
    sys.exit()
