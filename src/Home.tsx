import { useEffect, useState } from "react";
import styled from "styled-components";
import confetti from "canvas-confetti";
import * as anchor from "@project-serum/anchor";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { GatewayProvider } from "@civic/solana-gateway-react";
import Countdown from "react-countdown";
import { Snackbar, Paper, LinearProgress, Chip } from "@material-ui/core";
import Alert from "@material-ui/lab/Alert";
import { toDate, AlertState, getAtaForMint } from "./utils";
import { MintButton } from "./MintButton";
import { MultiMintButton } from "./MultiMintButton";
import { FaDiscord, FaGlobe, FaTwitter } from "react-icons/fa";
import Logo from "./images/Logo.gif";
import Nft from "./images/Nft.gif";
import collectionBanner from "./images/banner.png";
import {
  CandyMachine,
  awaitTransactionSignatureConfirmation,
  getCandyMachineState,
  mintOneToken,
  mintMultipleToken,
  CANDY_MACHINE_PROGRAM,
} from "./candy-machine";

const cluster = process.env.REACT_APP_SOLANA_NETWORK!.toString();
const decimals = process.env.REACT_APP_SPL_TOKEN_TO_MINT_DECIMALS
  ? +process.env.REACT_APP_SPL_TOKEN_TO_MINT_DECIMALS!.toString()
  : 9;
const splTokenName = process.env.REACT_APP_SPL_TOKEN_TO_MINT_NAME
  ? process.env.REACT_APP_SPL_TOKEN_TO_MINT_NAME.toString()
  : "TOKEN";

export interface HomeProps {
  candyMachineId: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  txTimeout: number;
  rpcHost: string;
}

const Home = (props: HomeProps) => {
  const [balance, setBalance] = useState<number>();
  const [isMinting, setIsMinting] = useState(false); // true when user got to press MINT
  const [isActive, setIsActive] = useState(false); // true when countdown completes or whitelisted
  const [solanaExplorerLink, setSolanaExplorerLink] = useState<string>("");
  const [itemsAvailable, setItemsAvailable] = useState(0);
  const [itemsRedeemed, setItemsRedeemed] = useState(0);
  const [itemsRemaining, setItemsRemaining] = useState(0);
  const [isSoldOut, setIsSoldOut] = useState(false);
  const [payWithSplToken, setPayWithSplToken] = useState(false);
  const [price, setPrice] = useState(0);
  const [priceLabel, setPriceLabel] = useState<string>("SOL");
  const [whitelistPrice, setWhitelistPrice] = useState(0);
  const [whitelistEnabled, setWhitelistEnabled] = useState(false);
  const [isBurnToken, setIsBurnToken] = useState(false);
  const [whitelistTokenBalance, setWhitelistTokenBalance] = useState(0);
  const [isEnded, setIsEnded] = useState(false);
  const [endDate, setEndDate] = useState<Date>();
  const [isPresale, setIsPresale] = useState(false);
  const [isWLOnly, setIsWLOnly] = useState(false);

  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: "",
    severity: undefined,
  });

  const wallet = useAnchorWallet();
  const [candyMachine, setCandyMachine] = useState<CandyMachine>();

  const rpcUrl = props.rpcHost;
  const solFeesEstimation = 0.012; // approx of account creation fees

  const refreshCandyMachineState = () => {
    (async () => {
      if (!wallet) return;

      const cndy = await getCandyMachineState(
        wallet as anchor.Wallet,
        props.candyMachineId,
        props.connection
      );

      setCandyMachine(cndy);
      setItemsAvailable(cndy.state.itemsAvailable);
      setItemsRemaining(cndy.state.itemsRemaining);
      setItemsRedeemed(cndy.state.itemsRedeemed);

      var divider = 1;
      if (decimals) {
        divider = +("1" + new Array(decimals).join("0").slice() + "0");
      }

      // detect if using spl-token to mint
      if (cndy.state.tokenMint) {
        setPayWithSplToken(true);
        // Customize your SPL-TOKEN Label HERE
        // TODO: get spl-token metadata name
        setPriceLabel(splTokenName);
        setPrice(cndy.state.price.toNumber() / divider);
        setWhitelistPrice(cndy.state.price.toNumber() / divider);
      } else {
        setPrice(cndy.state.price.toNumber() / LAMPORTS_PER_SOL);
        setWhitelistPrice(cndy.state.price.toNumber() / LAMPORTS_PER_SOL);
      }

      // fetch whitelist token balance
      if (cndy.state.whitelistMintSettings) {
        setWhitelistEnabled(true);
        setIsBurnToken(cndy.state.whitelistMintSettings.mode.burnEveryTime);
        setIsPresale(cndy.state.whitelistMintSettings.presale);
        setIsWLOnly(
          !isPresale && cndy.state.whitelistMintSettings.discountPrice === null
        );

        if (
          cndy.state.whitelistMintSettings.discountPrice !== null &&
          cndy.state.whitelistMintSettings.discountPrice !== cndy.state.price
        ) {
          if (cndy.state.tokenMint) {
            setWhitelistPrice(
              cndy.state.whitelistMintSettings.discountPrice?.toNumber() /
                divider
            );
          } else {
            setWhitelistPrice(
              cndy.state.whitelistMintSettings.discountPrice?.toNumber() /
                LAMPORTS_PER_SOL
            );
          }
        }

        let balance = 0;
        try {
          const tokenBalance = await props.connection.getTokenAccountBalance(
            (
              await getAtaForMint(
                cndy.state.whitelistMintSettings.mint,
                wallet.publicKey
              )
            )[0]
          );

          balance = tokenBalance?.value?.uiAmount || 0;
        } catch (e) {
          console.error(e);
          balance = 0;
        }
        setWhitelistTokenBalance(balance);
        setIsActive(isPresale && !isEnded && balance > 0);
      } else {
        setWhitelistEnabled(false);
      }

      // end the mint when date is reached
      if (cndy?.state.endSettings?.endSettingType.date) {
        setEndDate(toDate(cndy.state.endSettings.number));
        if (
          cndy.state.endSettings.number.toNumber() <
          new Date().getTime() / 1000
        ) {
          setIsEnded(true);
          setIsActive(false);
        }
      }
      // end the mint when amount is reached
      if (cndy?.state.endSettings?.endSettingType.amount) {
        let limit = Math.min(
          cndy.state.endSettings.number.toNumber(),
          cndy.state.itemsAvailable
        );
        setItemsAvailable(limit);
        if (cndy.state.itemsRedeemed < limit) {
          setItemsRemaining(limit - cndy.state.itemsRedeemed);
        } else {
          setItemsRemaining(0);
          cndy.state.isSoldOut = true;
          setIsEnded(true);
        }
      } else {
        setItemsRemaining(cndy.state.itemsRemaining);
      }

      if (cndy.state.isSoldOut) {
        setIsActive(false);
      }
    })();
  };

  const renderGoLiveDateCounter = ({ days, hours, minutes, seconds }: any) => {
    return (
      <div>
        <Paper className="Card" elevation={1}>
          <h1>{days}</h1>Days
        </Paper>
        <Paper className="Card" elevation={1}>
          <h1>{hours}</h1>
          Hours
        </Paper>
        <Paper className="Card" elevation={1}>
          <h1>{minutes}</h1>Mins
        </Paper>
        <Paper elevation={1} className="Card">
          <h1>{seconds}</h1>Secs
        </Paper>
      </div>
    );
  };

  const renderEndDateCounter = ({ days, hours, minutes }: any) => {
    let label = "";
    if (days > 0) {
      label += days + " days ";
    }
    if (hours > 0) {
      label += hours + " hours ";
    }
    label += minutes + 1 + " minutes left to MINT.";
    return (
      <div>
        <h3>{label}</h3>
      </div>
    );
  };

  function displaySuccess(mintPublicKey: any, qty: number = 1): void {
    let remaining = itemsRemaining - qty;
    setItemsRemaining(remaining);
    setIsSoldOut(remaining === 0);
    if (isBurnToken && whitelistTokenBalance && whitelistTokenBalance > 0) {
      let balance = whitelistTokenBalance - qty;
      setWhitelistTokenBalance(balance);
      setIsActive(isPresale && !isEnded && balance > 0);
    }
    setItemsRedeemed(itemsRedeemed + qty);
    if (!payWithSplToken && balance && balance > 0) {
      setBalance(
        balance -
          (whitelistEnabled ? whitelistPrice : price) * qty -
          solFeesEstimation
      );
    }
    setSolanaExplorerLink(
      cluster === "devnet" || cluster === "testnet"
        ? "https://solscan.io/token/" + mintPublicKey + "?cluster=" + cluster
        : "https://solscan.io/token/" + mintPublicKey
    );
    throwConfetti();
  }

  function throwConfetti(): void {
    confetti({
      particleCount: 400,
      spread: 70,
      origin: { y: 0.6 },
    });
  }

  function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function mintMany(quantityString: number) {
    if (wallet && candyMachine?.program && wallet.publicKey) {
      const quantity = Number(quantityString);
      const futureBalance =
        (balance || 0) -
        (whitelistEnabled && whitelistTokenBalance > 0
          ? whitelistPrice
          : price) *
          quantity;
      const signedTransactions: any = await mintMultipleToken(
        candyMachine,
        wallet.publicKey,
        quantity
      );

      const promiseArray = [];

      for (let index = 0; index < signedTransactions.length; index++) {
        const tx = signedTransactions[index];
        promiseArray.push(
          awaitTransactionSignatureConfirmation(
            tx,
            props.txTimeout,
            props.connection,
            "singleGossip",
            true
          )
        );
      }

      const allTransactionsResult = await Promise.all(promiseArray);
      let totalSuccess = 0;
      let totalFailure = 0;

      for (let index = 0; index < allTransactionsResult.length; index++) {
        const transactionStatus = allTransactionsResult[index];
        if (!transactionStatus?.err) {
          totalSuccess += 1;
        } else {
          totalFailure += 1;
        }
      }

      let retry = 0;
      if (allTransactionsResult.length > 0) {
        let newBalance =
          (await props.connection.getBalance(wallet.publicKey)) /
          LAMPORTS_PER_SOL;

        while (newBalance > futureBalance && retry < 20) {
          await sleep(2000);
          newBalance =
            (await props.connection.getBalance(wallet.publicKey)) /
            LAMPORTS_PER_SOL;
          retry++;
          console.log(
            "Estimated balance (" +
              futureBalance +
              ") not correct yet, wait a little bit and re-check. Current balance : " +
              newBalance +
              ", Retry " +
              retry
          );
        }
      }

      if (totalSuccess && retry < 20) {
        setAlertState({
          open: true,
          message: `Congratulations! Your ${quantity} mints succeeded!`,
          severity: "success",
        });

        // update front-end amounts
        displaySuccess(wallet.publicKey, quantity);
      }

      if (totalFailure || retry === 20) {
        setAlertState({
          open: true,
          message: `Some mints failed! (possibly ${totalFailure}) Wait a few minutes and check your wallet.`,
          severity: "error",
        });
      }

      if (totalFailure === 0 && totalSuccess === 0) {
        setAlertState({
          open: true,
          message: `Mints manually cancelled.`,
          severity: "error",
        });
      }
    }
  }

  async function mintOne() {
    if (wallet && candyMachine?.program && wallet.publicKey) {
      const mint = anchor.web3.Keypair.generate();
      const mintTxId = (
        await mintOneToken(candyMachine, wallet.publicKey, mint)
      )[0];

      let status: any = { err: true };
      if (mintTxId) {
        status = await awaitTransactionSignatureConfirmation(
          mintTxId,
          props.txTimeout,
          props.connection,
          "singleGossip",
          true
        );
      }

      if (!status?.err) {
        setAlertState({
          open: true,
          message: "Congratulations! Mint succeeded!",
          severity: "success",
        });

        // update front-end amounts
        displaySuccess(mint.publicKey);
      } else {
        setAlertState({
          open: true,
          message: "Mint failed! Please try again!",
          severity: "error",
        });
      }
    }
  }

  const startMint = async (quantityString: number) => {
    try {
      setIsMinting(true);
      if (quantityString === 1) {
        await mintOne();
      } else {
        await mintMany(quantityString);
      }
    } catch (error: any) {
      let message = error.msg || "Minting failed! Please try again!";
      if (!error.msg) {
        if (!error.message) {
          message = "Transaction Timeout! Please try again.";
        } else if (error.message.indexOf("0x138")) {
        } else if (error.message.indexOf("0x137")) {
          message = `SOLD OUT!`;
        } else if (error.message.indexOf("0x135")) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        }
      } else {
        if (error.code === 311) {
          message = `SOLD OUT!`;
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: "error",
      });
    } finally {
      setIsMinting(false);
    }
  };

  useEffect(() => {
    (async () => {
      if (wallet) {
        const balance = await props.connection.getBalance(wallet.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      }
    })();
  }, [wallet, props.connection]);

  useEffect(refreshCandyMachineState, [
    wallet,
    props.candyMachineId,
    props.connection,
    isEnded,
    isPresale,
  ]);

  return (
    <main>
      <section className="MainContainer">
        {/* Header */}
        <div className="navbar">
          <a href="/">
            <div className="logo">
              <img src={Logo} alt="" />
              <h1>LGBQT Collection</h1>
            </div>
          </a>
          <div className="navLinks">
            <ul>
              <li>
                <a href="">
                  <FaGlobe />
                </a>
              </li>
              <li>
                <a href="https://www.discord.com" target="_blank">
                  <FaDiscord />
                </a>
              </li>
              <li>
                <a href="https://www.twitter.com" target="_blank">
                  <FaTwitter />
                </a>
              </li>
            </ul>
            <div className="WalletContainer">
              <div className="Wallet">
                {wallet ? (
                  <div className="WalletAmount">
                    {(balance || 0).toLocaleString()} SOL
                    <WalletMultiButton className="ConnectButton" />
                  </div>
                ) : (
                  <WalletMultiButton className="ConnectButton">
                    Connect Wallet
                  </WalletMultiButton>
                )}
              </div>
            </div>
          </div>
        </div>

        <section className="MintContainer">
          <div className="DesContainer">
            <div className="minting Mint">
              
              <div>
                <img className="nft" src="main.gif" alt="NFT To Mint" />
              </div>
              
              {wallet &&
                isActive &&
                whitelistEnabled &&
                whitelistTokenBalance > 0 &&
                isBurnToken && (
                  <h3>
                    You own {whitelistTokenBalance} WL mint{" "}
                    {whitelistTokenBalance > 1 ? "tokens" : "token"}.
                  </h3>
                )}
              {wallet &&
                isActive &&
                whitelistEnabled &&
                whitelistTokenBalance > 0 &&
                !isBurnToken && (
                  <h3>You are whitelisted and allowed to mint.</h3>
                )}
              {wallet &&
                isActive &&
                endDate &&
                Date.now() < endDate.getTime() && (
                  <Countdown
                    date={toDate(candyMachine?.state?.endSettings?.number)}
                    onMount={({ completed }) => completed && setIsEnded(true)}
                    onComplete={() => {
                      setIsEnded(true);
                    }}
                    renderer={renderEndDateCounter}
                  />
                )}

              <h3 className="mintInfo">
                <span className="InfoMint">TOTAL MINTED:</span> {itemsRedeemed}{" "}
                / {itemsAvailable}
              </h3>
              <h3 className="mintInfo">
                <span className="InfoMint">CURRENT PRICE:</span>{" "}
                {isActive && whitelistEnabled && whitelistTokenBalance > 0
                  ? whitelistPrice + " " + priceLabel
                  : price + " " + priceLabel}
              </h3>
              {wallet && isActive && (
                <LinearProgress
                  className="BorderLinearProgress"
                  variant="determinate"
                  value={100 - (itemsRemaining * 100) / itemsAvailable}
                />
              )}
              <br />
              <div className="MintButtonContainer">
                {!isActive &&
                !isEnded &&
                candyMachine?.state.goLiveDate &&
                (!isWLOnly || whitelistTokenBalance > 0) ? (
                  <Countdown
                    date={toDate(candyMachine?.state.goLiveDate)}
                    onMount={({ completed }) =>
                      completed && setIsActive(!isEnded)
                    }
                    onComplete={() => {
                      setIsActive(!isEnded);
                    }}
                    renderer={renderGoLiveDateCounter}
                  />
                ) : !wallet ? (
                  <WalletMultiButton className="ConnectButton">
                    Connect Wallet
                  </WalletMultiButton>
                ) : !isWLOnly || whitelistTokenBalance > 0 ? (
                  candyMachine?.state.gatekeeper &&
                  wallet.publicKey &&
                  wallet.signTransaction ? (
                    <GatewayProvider
                      wallet={{
                        publicKey:
                          wallet.publicKey ||
                          new PublicKey(CANDY_MACHINE_PROGRAM),
                        //@ts-ignore
                        signTransaction: wallet.signTransaction,
                      }}
                      // // Replace with following when added
                      // gatekeeperNetwork={candyMachine.state.gatekeeper_network}
                      gatekeeperNetwork={
                        candyMachine?.state?.gatekeeper?.gatekeeperNetwork
                      } // This is the ignite (captcha) network
                      /// Don't need this for mainnet
                      clusterUrl={rpcUrl}
                      options={{ autoShowModal: false }}
                    >
                      <MintButton
                        candyMachine={candyMachine}
                        isMinting={isMinting}
                        isActive={isActive}
                        isEnded={isEnded}
                        isSoldOut={isSoldOut}
                        onMint={startMint}
                      />
                    </GatewayProvider>
                  ) : (
                    /*<MintButton
                                                candyMachine={candyMachine}
                                                isMinting={isMinting}
                                                isActive={isActive}
                                                isEnded={isEnded}
                                                isSoldOut={isSoldOut}
                                                onMint={startMint}
                                            />*/
                    <MultiMintButton
                      candyMachine={candyMachine}
                      isMinting={isMinting}
                      isActive={isActive}
                      isEnded={isEnded}
                      isSoldOut={isSoldOut}
                      onMint={startMint}
                      price={
                        whitelistEnabled && whitelistTokenBalance > 0
                          ? whitelistPrice
                          : price
                      }
                    />
                  )
                ) : (
                  <h1>Mint is private.</h1>
                )}
              </div>
              <br />
              {wallet && isActive && solanaExplorerLink && (
                <a
                  className="SolExplorerLink"
                  href={solanaExplorerLink}
                  rel="noreferrer"
                  target="_blank"
                >
                  View on Solscan
                </a>
              )}
            </div>
          </div>
        </section>

         {/* About Collection */}
         <div className="aboutSection">
          <div>
            <div>
              <img src={collectionBanner} alt="" className="nftBanner" />
            </div>
            <div className="aboutCollection">
              <div>
                <h1>We Love, Unite for Love</h1>
              </div>
              <p>
                Embark on a visual journey celebrating love, diversity, and
                unity with our LGBQT NFT collection. Each digital artwork in
                this collection is a vibrant testament to the kaleidoscope of
                love, embracing every color of the rainbow. From the soft
                whispers of romance to the bold declarations of passion, these
                NFTs are crafted to resonate with the essence of unity, inviting
                individuals from all walks of life to join hands in a
                celebration of love that knows no boundaries.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Home;
