import * as path from "path";
import * as Koa from "koa";
import { API_SERVER_HOST, API_SERVER_PORT, IS_DOCKER } from "../env";
import * as bodyParser from "koa-bodyparser";
import * as koaStatic from "koa-static";
import * as route from "koa-route";
import * as cors from "@koa/cors";
import * as compress from "koa-compress";
import ProfileService from "./service/ProfileService";
import ConsoleWrapper from "./util/ConsoleWrapper";
import startRateLimitWSServer from "./ws";
import GithubService from "./service/GithubService";

const app = new Koa();

app.use(bodyParser({}));

app.use(
    compress({
        filter: function(content_type) {
            return /(json|html|text)/i.test(content_type);
        },
        threshold: 2048,
        flush: require("zlib").Z_SYNC_FLUSH
    })
);

// x-response-time
app.use(async (ctx, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    ctx.set("X-Response-Time", `${ms}ms`);
});

app.use(cors({ credentials: true }));

app.use(
    route.get("/assets/(.*)/", koaStatic(path.resolve(__dirname, "../dist"), {
        gzip: true,
        index: "",
        maxage: 31536000000 // milliseconds
    }) as any)
);

app.use(
    route.get("/api/profile/:username", async (ctx, username) => {
        try {
            const ps = new ProfileService();
            const profile = await ps.getUserProfile(username);
            ctx.status = 200;
            ctx.body = profile;
        } catch (err) {
            ctx.throw(err.message || err.toString(), 500);
        }
    })
);

app.on("error", err => {
    ConsoleWrapper.error(err);
});

app.listen(API_SERVER_PORT, IS_DOCKER ? "0.0.0.0" : API_SERVER_HOST, () => {
    ConsoleWrapper.log(
        `API Server Is Listening at http://${
            IS_DOCKER ? "0.0.0.0" : API_SERVER_HOST
        }:${API_SERVER_PORT}`
    );
    startRateLimitWSServer();
});

process.on("exit", code => {
    ConsoleWrapper.log(`Process about to exit with code: ${code}`);
    GithubService.cancelScheduleJob();
});
