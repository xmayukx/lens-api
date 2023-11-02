import express, { Express, Request, Response, Application } from "express";
import axios from "axios";
import dotenv from "dotenv";
import router from "./src/routes";
import bodyParser from "body-parser";
import cors from "cors";

//For env File
dotenv.config();
const app: Application = express();
const port = process.env.PORT || 8000;
const corsOpts = {
  origin: "*",

  methods: ["GET", "POST"],

  allowedHeaders: ["Content-Type"],
};

app.use(cors(corsOpts));
app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use(router);

app.get("/", (req: Request, res: Response) => {
  res.send("Lens Protocol");
});

app.listen(port, () => {
  console.log(`Server is Fire at http://localhost:${port}`);
});
