import { Logger } from "../../utils/logger";
import { sleep } from "../../utils/basics";
import { JSDOM } from "jsdom";
import { AmazonRestPage } from "./AmazonRestPage";

// WORK IN PROGRESS, NOT USED, NOT READY

interface AmazonSimplifiedPageProps {
  tld: string;
  withCache: boolean;
  withProxy: boolean;
}

export class AmazonSimplifiedPage {

  private readonly tld: string;
  private readonly logId: string;

  private readonly rootUrl: string;

  private readonly logger: Logger;

  private readonly restPage: AmazonRestPage;
  
  constructor(params: AmazonSimplifiedPageProps) {

    this.tld = params.tld;
    this.logId     = `rest-page/${this.tld === "co.uk" ? "uk" : this.tld}`;
    this.logger    = new Logger(this.logId);
    this.rootUrl = `https://www.amazon.${this.tld}/`;

    // TODO: FIX PARAMS
    // this.restPage = new AmazonRestPage(params);

  }

  async checkCookiesBanner() {

    const body = await this.restPage.openUrl(this.rootUrl);

    const dom = new JSDOM(body);
    const document = dom.window.document;

    const cookiesForm = document.querySelectorAll("#sp-cc");

  }

  async isLoggedIn() {
    const welcomeBody = await this.restPage.openUrl(this.rootUrl);
    const welcomeDocument = new JSDOM(welcomeBody).window.document;
    const links = welcomeDocument.querySelectorAll("a");
    const signinLinks = [...links].filter(l => l.href.indexOf("/ap/signin?openid.pape") >= 0 && l.href.indexOf("switch_account") < 0);
    return signinLinks.length === 0;
  }

  /// IT DOESN'T WORK, AMAZON PUT A HIDDEN INPUT FIELD USING JAVASCRIPT
  async login(email: string, password: string) {

    const welcomeBody = await this.restPage.openUrl(this.rootUrl);

    const welcomeDocument = new JSDOM(welcomeBody).window.document;
    // console.log(body);

    const links = welcomeDocument.querySelectorAll("a");
    const signinLinks = [...links].filter(l => l.href.indexOf("/ap/signin?openid.pape") >= 0);
    
    if (signinLinks.length === 0) {
      this.logger.error("Cannot find login link, quitting.");
      return;
    }

    this.logger.info(`Opening link ${signinLinks[0].href} to perform login`)

    const loginBody = await this.restPage.openUrl(signinLinks[0].href);
    // const loginDocument = new JSDOM(loginBody, { pretendToBeVisual: true, runScripts: "dangerously", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36" }).window.document;
    const loginDocument = new JSDOM(loginBody).window.document;

    const signInForm = loginDocument.querySelector<HTMLFormElement>('form[name="signIn"]');

    // console.log("Sign in form: ", signInForm.innerHTML);

    const inputs = [... signInForm.querySelectorAll<HTMLInputElement>('input[type="hidden"]')];

    let formData = [
      ...inputs.map(i => ({ name: i.name, value: i.value })),
      { name: "email",    value: email    },
      { name: "password", value: password },
    ]

    console.log("action is ", signInForm.action, " data is ", formData);

    await sleep(3000);

    console.log("action is ", signInForm.action, " data fater 3 seconds is ", formData);

    const resultBody = await this.restPage.openPostUrl(signInForm.action, formData);

    // console.log(resultBody);

  }

}
