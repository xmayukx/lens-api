import dotenv from "dotenv";
dotenv.config();
require("dotenv").config();
import express, { Request, Response } from "express";

import {
  ChangeProfileManagerActionType,
  LensClient,
  development,
  isRelaySuccess,
  isValidProfileHandle,
} from "@lens-protocol/client";

import { Wallet, ethers } from "ethers";
const router = express.Router();

const lensClient = new LensClient({
  environment: development,
});

router.post("/login", async (req: Request, res: Response) => {
  const { pvtKey, handle } = req.body;
  try {
    const wallet = new ethers.Wallet(pvtKey);
    const address = await wallet.getAddress();
    const allOwnedProfiles = await lensClient.profile.fetchAll({
      where: {
        ownedBy: [address],
      },
    });
    const newProfile = allOwnedProfiles.items.find(
      (item) => item.handle?.fullHandle == `test/${handle}`
    );

    const profile = await lensClient.profile.fetch({
      forProfileId: newProfile?.id,
    });
    // console.log(profileByHandle?.id);
    const { id, text } = await lensClient.authentication.generateChallenge({
      signedBy: address,
      for: profile?.id,
    });
    console.log(profile?.id, profile?.handle?.fullHandle);

    // console.log(id, text);
    const signature = await wallet.signMessage(text);
    await lensClient.authentication.authenticate({
      id,
      signature,
    });
    const isAuthenticated = await lensClient.authentication.isAuthenticated();
    if (!isAuthenticated) {
      return res.status(401).send({ mesg: "Not Authenticated" });
    }

    return res.status(200).send({ id, text, authentication: isAuthenticated });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ mesg: "Internal server error", error });
  }
});
type Profile = {
  handle: string;
  evmAddress: string;
  pvtKey: string;
};
router.post("/create-profile", async (req: Request, res: Response) => {
  const { handle, evmAddress, pvtKey } = req.body;

  const wallet = new ethers.Wallet(pvtKey);
  const address = await wallet.getAddress();
  console.log(`Creating a new profile for ${address} with handle "${handle}"`);

  const profileCreateResult = await lensClient.profile.create({
    handle: handle,
    to: evmAddress,
  });

  // profileCreateResult is a Result object

  const profileCreateResultValue = profileCreateResult;

  if (!isRelaySuccess(profileCreateResultValue)) {
    console.log(`Something went wrong`, profileCreateResultValue);
    return;
  }

  console.log(
    `Transaction to create a new profile with handle "${handle}" was successfuly broadcasted with txId ${profileCreateResultValue.txId}`
  );

  console.log(`Waiting for the transaction to be indexed...`);
  await lensClient.transaction.waitUntilComplete({
    forTxHash: profileCreateResultValue.txHash,
  });

  const allOwnedProfiles = await lensClient.profile.fetchAll({
    where: {
      ownedBy: [address],
    },
  });

  console.log(
    `All owned profiles: `,
    allOwnedProfiles.items.map((i) => ({ id: i.id, handle: i.handle }))
  );

  const newProfile = allOwnedProfiles.items.find(
    (item) => item.handle?.fullHandle == `test/${handle}`
  );

  if (newProfile) {
    console.log(`The newly created profile's id is: ${newProfile.id}`);
    res
      .send({ handle: newProfile.handle?.localName, id: newProfile.id })
      .status(200);
  }
});

router.post("/enable-dispatcher", async (req: Request, res: Response) => {
  const { handle } = req.body;

  const isAuthenticated = await lensClient.authentication.isAuthenticated();
  if (!isAuthenticated) {
    return res.status(401).send({ mesg: "Not Authenticated" });
  }
  const wallet = new Wallet(process.env.PRIVATE_KEY!);
  if (!wallet.address) {
    return res.status(401).send({ mesg: "Wallet not found" });
  }
  const address = await wallet.getAddress();

  const allOwnedProfiles = await lensClient.profile.fetchAll({
    where: { ownedBy: [address] },
  });
  const newProfile = allOwnedProfiles.items.find(
    (item) => item.handle?.fullHandle == `test/${handle}`
  );
  // console.log(allOwnedProfiles.items[0].handle == handle);
  const profileByid = await lensClient.profile.fetch({
    forProfileId: newProfile?.id,
  });
  console.log(profileByid?.signless);
  if (profileByid?.signless) {
    console.log("Profile manager is enabled");
    return res.status(200).send({ mesg: "Profile manager is enabled" });
  } else {
    const typedDataResult =
      await lensClient.profile.createChangeProfileManagersTypedData({
        approveSignless: true,
        changeManagers: [
          {
            action: ChangeProfileManagerActionType.Add,
            address: address,
          },
        ],
      });

    const { id, typedData } = typedDataResult.unwrap();

    // sign with the wallet
    const signedTypedData = await wallet._signTypedData(
      typedData.domain,
      typedData.types,
      typedData.value
    );

    // broadcast onchain
    const broadcastOnchainResult =
      await lensClient.transaction.broadcastOnchain({
        id,
        signature: signedTypedData,
      });

    const onchainRelayResult = broadcastOnchainResult.unwrap();

    if (onchainRelayResult.__typename === "RelayError") {
      console.log(`Something went wrong`);
      return;
    }

    console.log(
      `Successfully changed profile managers with transaction with id ${onchainRelayResult}, txHash: ${onchainRelayResult.txHash}`
    );

    res.send({ mesg: "Profile manager is enabled" }).status(200);
  }
});

router.post("/create-post", async (req: Request, res: Response) => {
  const { text } = req.body;
  // the client instance must be authenticated
  const isAuthenticated = await lensClient.authentication.isAuthenticated();
  if (!isAuthenticated) {
    return res.status(401).send({ mesg: "Not Authenticated" });
  }

  const wallet = new Wallet(process.env.PRIVATE_KEY!);
  if (!wallet.address) {
    return res.status(401).send({ mesg: "Wallet not found" });
  }
  const result = await lensClient.publication.postOnchain({
    contentURI: text,
  });

  const resultValue = result.unwrap();

  if (!isRelaySuccess(resultValue)) {
    console.log(`Something went wrong`, resultValue);
    return;
  }

  console.log(
    `Transaction was successfully broadcasted with txId ${resultValue.txId}`
  );
  res.send({ mesg: "Post created" }).status(200);
});

export default router;
