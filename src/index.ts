"use strict";
import * as vscode from "vscode";
import * as http from "http";
import * as url from "url";
import { init, localize } from "vscode-nls-i18n";
const httpProxy = require("http-proxy");
const getPort = require("get-port");
const ip = require("internal-ip");

let currentServer: http.Server | void;
let statusbar: vscode.StatusBarItem;

enum Commands {
  Start = "http-proxy.start",
  Stop = "http-proxy.stop"
}

async function updateContext(val: boolean | void) {
  await vscode.commands.executeCommand(
    "setContext",
    "HTTP_PROXY_SERVER_RUNNING",
    val
  );
}

function isValidUrl(input: string): boolean {
  const parser = url.parse(input);
  if (!parser.hostname || /\.[a-z]+$/i.test(parser.hostname) === false) {
    return false;
  }
  return true;
}

export async function activate(context: vscode.ExtensionContext) {
  init(context);

  async function close() {
    if (currentServer) {
      currentServer.close();
      currentServer = undefined;
    }
    await updateContext(void 0);
    if (statusbar) {
      statusbar.dispose();
    }
  }

  context.subscriptions.push(
    vscode.commands.registerCommand(Commands.Stop, close)
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(Commands.Start, async (uri: vscode.Uri) => {
      const configuration = vscode.workspace.getConfiguration("http-proxy");
      const port = configuration.get("port") || (await getPort()) || 8080;
      const cors: boolean = configuration.get("cors") || false;
      let headers: { [key: string]: string } =
        configuration.get("headers") || {};
      let target: string | void = configuration.get("target");

      if (!target) {
        target = await vscode.window.showInputBox({
          placeHolder: localize("tip.enter_url"),
          async validateInput(input) {
            return isValidUrl(input) ? null : localize("err.invalid_url");
          }
        });
        if (!target) {
          return;
        }
      }

      const host = await ip.v4();

      const proxy = httpProxy.createProxyServer({
        ws: true,
        secure: true,
        xfwd: true,
        toProxy: true,
        followRedirects: true,
        changeOrigin: true
      });

      await new Promise((resolve, reject) => {
        currentServer = http
          .createServer((req, res) => {
            if (cors) {
              const corsHeaders = {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers":
                  "Accept, Accept-CH, Accept-Charset, Accept-Datetime, Accept-Encoding, Accept-Ext, Accept-Features, Accept-Language, Accept-Params, Accept-Ranges, Access-Control-Allow-Credentials, Access-Control-Allow-Headers, Access-Control-Allow-Methods, Access-Control-Allow-Origin, Access-Control-Expose-Headers, Access-Control-Max-Age, Access-Control-Request-Headers, Access-Control-Request-Method, Age, Allow, Alternates, Authentication-Info, Authorization, C-Ext, C-Man, C-Opt, C-PEP, C-PEP-Info, CONNECT, Cache-Control, Compliance, Connection, Content-Base, Content-Disposition, Content-Encoding, Content-ID, Content-Language, Content-Length, Content-Location, Content-MD5, Content-Range, Content-Script-Type, Content-Security-Policy, Content-Style-Type, Content-Transfer-Encoding, Content-Type, Content-Version, Cookie, Cost, DAV, DELETE, DNT, DPR, Date, Default-Style, Delta-Base, Depth, Derived-From, Destination, Differential-ID, Digest, ETag, Expect, Expires, Ext, From, GET, GetProfile, HEAD, HTTP-date, Host, IM, If, If-Match, If-Modified-Since, If-None-Match, If-Range, If-Unmodified-Since, Keep-Alive, Label, Last-Event-ID, Last-Modified, Link, Location, Lock-Token, MIME-Version, Man, Max-Forwards, Media-Range, Message-ID, Meter, Negotiate, Non-Compliance, OPTION, OPTIONS, OWS, Opt, Optional, Ordering-Type, Origin, Overwrite, P3P, PEP, PICS-Label, POST, PUT, Pep-Info, Permanent, Position, Pragma, ProfileObject, Protocol, Protocol-Query, Protocol-Request, Proxy-Authenticate, Proxy-Authentication-Info, Proxy-Authorization, Proxy-Features, Proxy-Instruction, Public, RWS, Range, Referer, Refresh, Resolution-Hint, Resolver-Location, Retry-After, Safe, Sec-Websocket-Extensions, Sec-Websocket-Key, Sec-Websocket-Origin, Sec-Websocket-Protocol, Sec-Websocket-Version, Security-Scheme, Server, Set-Cookie, Set-Cookie2, SetProfile, SoapAction, Status, Status-URI, Strict-Transport-Security, SubOK, Subst, Surrogate-Capability, Surrogate-Control, TCN, TE, TRACE, Timeout, Title, Trailer, Transfer-Encoding, UA-Color, UA-Media, UA-Pixels, UA-Resolution, UA-Windowpixels, URI, Upgrade, User-Agent, Variant-Vary, Vary, Version, Via, Viewport-Width, WWW-Authenticate, Want-Digest, Warning, Width, X-Content-Duration, X-Content-Security-Policy, X-Content-Type-Options, X-CustomHeader, X-DNSPrefetch-Control, X-Forwarded-For, X-Forwarded-Port, X-Forwarded-Proto, X-Frame-Options, X-Modified, X-OTHER, X-PING, X-PINGOTHER, X-Powered-By, X-Requested-With",
                "Access-Control-Allow-Methods": "PUT,POST,GET,DELETE,OPTIONS"
              };
              if (headers) {
                headers = {
                  ...corsHeaders,
                  ...headers
                };
              } else {
                headers = { ...corsHeaders };
              }
            }
            if (headers) {
              for (const key in headers) {
                if (headers.hasOwnProperty) {
                  res.setHeader(key, headers[key]);
                }
              }
            }
            proxy.web(req, res, { target });
          })
          .listen(port, () => {
            resolve();
          });
      });

      await updateContext(true);

      const source = `http://${host}:${port}`;

      const statusBarMsg = localize("status.server.on", source, target);

      vscode.window.showInformationMessage(statusBarMsg);

      statusbar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left
      );
      statusbar.text = `$(link) ${statusBarMsg}`;
      statusbar.tooltip = localize("status.server.tooltip");
      statusbar.show();
      statusbar.command = Commands.Stop;
    })
  );
}

// this method is called when your extension is deactivated
export async function deactivate(context: vscode.ExtensionContext) {
  if (statusbar) {
    statusbar.dispose();
  }
  if (currentServer) {
    currentServer.close();
  }

  await updateContext(void 0);

  for (const subscription of context.subscriptions) {
    subscription.dispose();
  }
}
