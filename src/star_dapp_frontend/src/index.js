import {
  idlFactory,
  canisterId,
  star_dapp_backend,
} from "../../declarations/star_dapp_backend";
import {
  icp2usd,
  get_account_id,
  star_str,
  formattime,
  uint2hex,
} from "./util.js";
import {
  NNS_CANISTER_ID,
  LEDGER_CANISTER_ID,
  CYCLES_MINTING_CANISTER_ID,
} from "./util.js";
import { generate_star_dapp_key, import_star_dapp_key } from "./util.js";
import { rsa_encrypt, rsa_decrypt, cbor_sha256 } from "./util.js";
import { star_dappjs, countDownTime } from "./init.js";
import ledgerIDL from "./candid/ledger.did.js";
import "tui-pagination/dist/tui-pagination.css";

let whitelist = [
  canisterId,
  NNS_CANISTER_ID,
  LEDGER_CANISTER_ID,
  CYCLES_MINTING_CANISTER_ID,
];
let host =
  process.env.NODE_ENV && process.env.NODE_ENV !== "production"
    ? "http://localhost:8080/"
    : "https://ic0.app";

let star_dappApp = {
  key: null,
};

let star_dappActor = null;
let icpusd = 0;
let login_type = "";

async function getStarDAppActor() {
  if (!star_dappjs.isauth()) {
    return star_dapp_backend;
  }

  if (star_dappActor) {
    return star_dappActor;
  }

  if (login_type == "bitfinity") {
    star_dappActor = await window.ic.infinityWallet.createActor({
      canisterId: canisterId,
      interfaceFactory: idlFactory,
      host: host,
    });
  } else {
    star_dappActor = await window.ic.plug.createActor({
      canisterId: canisterId,
      interfaceFactory: idlFactory,
    });
  }

  return star_dappActor;
}

async function init_star_dapp() {
  let i2u = await icp2usd();
  icpusd = i2u;
  star_dappjs.refreshII({});
}

async function refresh_star_dapp(opt) {
  // let actor = await getStarDAppActor();
  let actor = star_dapp_backend;
  let resp = await actor.searchList(opt);
  let lists = resp.data;
  for (let i = 0; i < lists.length; i++) {
    lists[i].icp_price =
      Number((lists[i].price * 1000n) / BigInt(100_000_000)) / 1000;
    lists[i].usd_price = lists[i].icp_price * icpusd;
    lists[i].star_en = star_str(lists[i].star);
    lists[i].lockSecond = Number(lists[i].lockSecond);
    lists[i].limitStar = Number(lists[i].limitStar);
  }
  star_dappjs.renderII(resp.pageTotal, lists);
}

$(document).ready(async function () {
  let times = 1635688800000; // 2021-10-31 22:00:00 GMT+0800
  let d = new Date(times);
  if (d > new Date()) {
    countDownTime.init(times);
    countDownTime.start();
  }

  star_dappjs.init(do_connect, refresh_star_dapp, do_buy, load_user_info);

  if (window.ic && window.ic.plug) {
    // const connected = await window.ic.plug.isConnected();
    // console.log(`Plug connection is ${connected}`);
    // if (connected) {
    //   if (!window.ic.plug.agent) {
    //     console.log(whitelist);
    //     await window.ic.plug.createAgent({ whitelist, host })
    //     console.log(window.ic.plug.agent);
    //     if (process.env.NODE_ENV !== "production") {
    //       window.ic.plug.agent.fetchRootKey().catch(err => {
    //         console.warn("Unable to fetch root key. Check to ensure that your local replica is running");
    //         console.error(err);
    //       });
    //     }
    //   }
    //   const principalId = await window.ic.plug.agent.getPrincipal();
    //   console.log(`Plug's user principal Id is ${principalId}`);
    //   star_dappjs.setuser(principalId.toText());
    //   star_dapp_key_init();
    //   load_tx_recored();
    // }
  }
  init_star_dapp();
});

async function do_connect(tp) {
  let res = false;
  if (tp == "plug") {
    res = await do_connect_plug();
  } else {
    res = await do_connect_bitfinity();
  }
  return res;
}

async function do_connect_bitfinity() {
  try {
    let connected = await window.ic.infinityWallet.isConnected();
    if (!connected) {
      connected = await window.ic.infinityWallet.requestConnect({ whitelist });
    }
    if (!connected) return false;
    const principalId = await window.ic.infinityWallet.getPrincipal();
    console.log(`Bitfinity's user principal Id is ${principalId}`);
    login_type = "bitfinity";

    // if (process.env.NODE_ENV !== "production") {
    //   window.ic.infinityWallet.agent.fetchRootKey().catch((err) => {
    //     console.warn("Unable to fetch root key. Check to ensure that your local replica is running");
    //     console.error(err);
    //   });
    // }

    star_dappjs.setuser(principalId.toText());
    await getStarDAppActor();

    {
      star_dappjs.refreshII();
      star_dapp_key_init();
      load_user_info();
    }

    return true;
  } catch (e) {
    console.log(e);
  }

  return false;
}

async function do_connect_plug() {
  try {
    let connected = await window.ic.plug.requestConnect({ whitelist, host });
    if (!connected) return false;
    const principalId = await window.ic.plug.agent.getPrincipal();
    console.log(`Plug's user principal Id is ${principalId}`);
    login_type = "plug";

    if (process.env.NODE_ENV !== "production") {
      window.ic.plug.agent.fetchRootKey().catch((err) => {
        console.warn(
          "Unable to fetch root key. Check to ensure that your local replica is running"
        );
        console.error(err);
      });
    }

    star_dappjs.setuser(principalId.toText());
    await getStarDAppActor();

    {
      star_dappjs.refreshII();
      star_dapp_key_init();
      load_user_info();
    }

    return true;
  } catch (e) {
    console.log(e);
  }

  return false;
}

async function do_buy(id) {
  if (!id) {
    return;
  }
  let actor = await getStarDAppActor();
  let resp = await actor.lock(id);
  if (resp && resp.length > 0) {
    // console.log(resp[0]);
    do_transfer(resp[0]);
  } else {
    star_dappjs.paying(0);
    alert("You are not allowed to buy it or It Locked by other user!");
  }
}

async function transfer_bitfinity(params) {
  let result = {
    height: null,
  };
  console.log(get_account_id(params.to.toString(), 0));
  const TRANSFER_ICP_TX = {
    idl: ledgerIDL,
    canisterId: LEDGER_CANISTER_ID,
    methodName: "send_dfx",
    args: [
      {
        to: get_account_id(params.to, 0),
        fee: { e8s: BigInt(10000) },
        amount: { e8s: params.amount },
        memo:
          params.opts && params.opts.memo
            ? BigInt(params.opts.memo)
            : BigInt("123"),
        from_subaccount: [], // For now, using default subaccount to handle ICP
        created_at_time: [],
      },
    ],
    onSuccess: async (res) => {
      console.log("transferred icp successfully", res);
      result.height = res;
    },
    onFail: (res) => {
      console.log("transfer icp error", res);
    },
  };

  await window.ic.infinityWallet.batchTransactions([TRANSFER_ICP_TX], {
    host: undefined,
  });
  console.log("Done!", result);
  return result;
}

async function do_transfer(payinfo) {
  if (!star_dappjs.isauth()) {
    return;
  }
  star_dappjs.paying(2);
  let amount = payinfo.price;
  if (process.env.NODE_ENV !== "production") {
    amount = 100n;
  }
  let params = {
    to: payinfo.to.toString(),
    amount: Number(amount),
  };
  if (payinfo.memo) {
    params.opts = { memo: payinfo.memo.toString() };
  }
  // console.log(payinfo);
  // console.log(params);
  try {
    let result = null;
    if (login_type == "bitfinity") {
      result = await transfer_bitfinity(params);
    } else {
      result = await window.ic.plug.requestTransfer(params);
    }
    if (result && result.height) {
      console.log(result);
      star_dappjs.paying(3);
      (async () => {
        let actor = await getStarDAppActor();
        await actor.purchase(
          payinfo.code,
          payinfo.id,
          BigInt(result.height),
          payinfo.memo
        );
        load_user_info();
        star_dappjs.refreshII();
      })();
    }
  } catch (e) {
    console.log(e);
    (async () => {
      let actor = await getStarDAppActor();
      await actor.unlock(payinfo.id);
      star_dappjs.refreshII();
    })();
    star_dappjs.paying(0);
  }
}

async function load_user_info() {
  load_user_star();
  load_tx_recored();
}

async function load_user_star() {
  let actor = await getStarDAppActor();
  let star_num = await actor.getStar();
  // two decimal
  let star_count = Number((star_num * 100n) / 100_000_000n) / 100;
  console.log("star => ", star_count);
  star_dappjs.renderStar(star_count);
}

async function load_tx_recored() {
  let actor = await getStarDAppActor();

  try {
    let txlists = await actor.getTxList();
    let lists = [];

    for (let i = 0; i < txlists.length; i++) {
      let el = txlists[i];
      let data = {
        id: el.pay.id,
        secret: el.secret,
        pay: el.pay,
      };

      if (data.secret !== "" && star_dappApp.key) {
        data.secret = await rsa_decrypt(
          data.secret,
          star_dappApp.key.privateKey
        );
      }

      if (el.block.length > 0) {
        let block = el.block[0];
        data.block = block;
        // data.hash = cbor_sha256(block.transaction); //
        data.hash = uint2hex(block.parent_hash[0].inner);
        let stamp = Number(
          BigInt(block.timestamp.timestamp_nanos) / BigInt(1e6)
        );
        data.stamp = stamp;
        data.time = formattime(data.stamp);
        data.icp_price =
          Number((data.pay.price * 100_000n) / 100_000_000n) / 100_000;
        data.from = block.transaction.transfer.Send.from;
        data.to = block.transaction.transfer.Send.to;
        // data.icp_fee = Number(data.pay.price * 100_000n / 100_000_000n) / 100_000;
      }
      lists.push(data);
    }
    star_dappjs.renderTx(lists);
  } catch (e) {
    console.log(e);
    star_dappjs.renderTxErr();
  }
}

async function star_dapp_key_init() {
  let lstore = window.localStorage;
  if (
    !lstore.getItem("star_dapp_backend-public-key") ||
    !lstore.getItem("star_dapp_backend-private-key")
  ) {
    let star_dappKey = await generate_star_dapp_key();
    if (star_dappKey) {
      console.log("generate publickey", star_dappKey.publicStr);
      lstore.setItem("star_dapp_backend-public-key", star_dappKey.publicStr);
      lstore.setItem("star_dapp_backend-private-key", star_dappKey.privateStr);
      star_dappApp.key = star_dappKey;
    }
  } else {
    let star_dappKey = await import_star_dapp_key(
      lstore.getItem("star_dapp_backend-public-key"),
      lstore.getItem("star_dapp_backend-private-key")
    );
    if (star_dappKey) {
      console.log("import publickey", star_dappKey.publicStr);
      star_dappApp.key = star_dappKey;
    }
  }
  let actor = await getStarDAppActor();
  let isok = await actor.seedPubkey(star_dappApp.key.publicStr);
  console.log(isok);
  if (!isok) {
    alert("It's not the main device!");
  }
}
