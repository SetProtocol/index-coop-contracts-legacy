import "module-alias/register";

import { solidityKeccak256 } from "ethers/lib/utils";
import { Address, Account } from "@utils/types";
import { ADDRESS_ZERO, ZERO, ONE_DAY_IN_SECONDS, ONE_YEAR_IN_SECONDS } from "@utils/constants";
import { ExchangeIssuance } from "@utils/contracts/index";
import { SetToken } from "@utils/contracts/setV2";
import DeployHelper from "@utils/deploys";
import {
  addSnapshotBeforeRestoreAfterEach,
  ether,
  getAccounts,
  getLastBlockTimestamp,
  getSetFixture,
  getStreamingFee,
  getStreamingFeeInflationAmount,
  getTransactionTimestamp,
  getUniswapFixture,
  getWaffleExpect,
  increaseTimeAsync,
  preciseMul,
} from "@utils/index";
import { SetFixture } from "@utils/fixtures";
import { UniswapFixture } from "@utils/fixtures";
import { BigNumber, ContractTransaction } from "ethers";

const expect = getWaffleExpect();

describe("ExchangeIssuance", async () => {
  let owner: Account;
  let operator: Account;
  let setV2Setup: SetFixture;

  let deployer: DeployHelper;
  let setToken: SetToken;

  let exchangeIssuance: ExchangeIssuance;

  beforeEach(async () => {
    [
      owner,
      operator,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    setV2Setup = getSetFixture(owner.address);
    await setV2Setup.initialize();

    setToken = await setV2Setup.createSetToken(
      [setV2Setup.dai.address],
      [ether(1)],
      [setV2Setup.debtIssuanceModule.address, setV2Setup.streamingFeeModule.address]
    );
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    let subjectUniswapFactoryAddress: Address;
    let subjectUniswapRouterAddress: Address;
    let subjectSushiswapFactoryAddress: Address;
    let subjectSushiswapRouterAddress: Address;
    let subjectControllerAddress: Address;
    let subjectBasicIssuanceModuleAddress: Address;

    before(async () => {
      let uniswapSetup: UniswapFixture;
      let sushiswapSetup: UniswapFixture;
      let wethAddress: Address;
      let wbtcAddress: Address;
      let daiAddress: Address;

      // TODO: should we instead port SystemFixtrue and use tokens from it ?
      wethAddress = setV2Setup.weth.address;
      wbtcAddress = setV2Setup.wbtc.address;
      daiAddress = setV2Setup.dai.address;

      uniswapSetup = await getUniswapFixture(owner.address);
      await uniswapSetup.initialize(owner, wethAddress, wbtcAddress, daiAddress);

      sushiswapSetup = await getUniswapFixture(owner.address);
      await sushiswapSetup.initialize(owner, wethAddress, wbtcAddress, daiAddress);

      subjectUniswapFactoryAddress = uniswapSetup.factory.address;
      subjectUniswapRouterAddress = uniswapSetup.router.address;
      subjectSushiswapFactoryAddress = sushiswapSetup.factory.address;
      subjectSushiswapRouterAddress = sushiswapSetup.factory.address;
      subjectControllerAddress = setV2Setup.controller.address;
      subjectBasicIssuanceModuleAddress = setV2Setup.issuanceModule.address;
    });

    async function subject(): Promise<ExchangeIssuance> {
      return await deployer.adapters.deployExchangeIssuance(
        subjectUniswapFactoryAddress,
        subjectUniswapRouterAddress,
        subjectSushiswapFactoryAddress,
        subjectSushiswapRouterAddress,
        subjectControllerAddress,
        subjectBasicIssuanceModuleAddress
      );
    }

    it("verify state set properly via constructor", async () => {
      // execute the test subject, which is the function we're testing
      const exchangeIssuanceContract: ExchangeIssuance = await subject();

      // TODO: verify all of the state set in the constructor is correct
      const expectedController = await exchangeIssuanceContract.controller();
      expect(expectedController).to.eq(setV2Setup.controller.address);

      // uniFactory?
      // uniRouter?
      // sushiFactory?
      // sushiRouter?
      // WETH?
      // controller?
      // basicIssuanceModule?
    });

    it("approves WETH to the uniswap and sushiswap router", async () => {
      await subject();

      // validate the allowance of WETH between uniswap, sushiswap, and the deployed exchange issuance contract
    });
  });

  context("when exchange issuance is deployed", async () => {
    beforeEach(async () => {
      // TODO: deploy required fixtures and exchange issuance
    });

    describe("#approveToken", async () => {
      let subjectTokenToApproveAddress: Address;

      beforeEach(async () => {
        // What token are we trying to test the approval for?
        // subjectTokenToApproveAddress = ?
      });

      async function subject(): Promise<ContractTransaction> {
        return await exchangeIssuance.approveToken(subjectTokenToApproveAddress);
      }

      it("should update the approvals correctly", async () => {
        // What state do you want to record before the test is run? (allowance)

        // Execute the function in question
        await subject();

        // What state do you want to verify against? (post approval allowance)
      });
    });

    describe("#approveTokens", async () => {
      let subjectTokensToApproveAddresses: Address[];

      beforeEach(async () => {
        // subjectTokensToApproveAddresses = ?
      });

      async function subject(): Promise<ContractTransaction> {
        return await exchangeIssuance.approveTokens(subjectTokensToApproveAddresses);
      }

      it("should update the approvals correctly", async () => {
        // What state do you want to record before the test is run? (allowances for each token)

        await subject();

        // What state do you want to verify against? (post approval allowances of each token)
      });

      context("when the set contains an external position", async () => {
        beforeEach(async () => {
          // Stick an external position into the Set
        });

        it("should revert", async () => {
          // Verify contract reverts with the corerct error message
          await expect(subject()).to.be.revertedWith("ExchangeIssuance: EXTERNAL_POSITIONS_NOT_ALLOWED");
        });
      });
    });

    describe("#issueSetForExactToken", async () => {
      let subjectSetToken: Address;
      let subjectInputToken: Address;
      let subjectAmountInput: BigNumber;
      let subjectMinSetReceive: BigNumber;

      beforeEach(async () => {
        // Deploy any required dependencies

        // subjectSetToken = ?
        // subjectInputToken = ?
        // subjectAmountInput = ?
        // subjectMinSetReceive = ?
      });

      async function subject(): Promise<ContractTransaction> {
        return await exchangeIssuance.issueSetForExactToken(
          subjectSetToken,
          subjectInputToken,
          subjectAmountInput,
          subjectMinSetReceive
        );
      }

      it("should issue the correct amount of Set to the caller", async () => {
        // What state do you want to record before the test is run? (balance of the user of the Set)

        await subject();

        // What state do you want to verify against? (balance of the user of the Set)
        // Was this the expected amount?
      });

      it("should use the correct amount of input token from the caller", async () => {
        // What state do you want to record before the test is run? (balance of the input token of the caller)

        await subject();

        // What state do you want to verify against? (balance of the input token of the caller)
        // Was this the expected amount?
      });

      it("emits a ExchangeIssue log", async () => {
        // const expectedSetTokenAmount = calculate expected set token amount

        await expect(subject()).to.emit(exchangeIssuance, "ExchangeIssue").withArgs(
          subjectCaller,
          subjectSetToken,
          subjectInputToken,
          subjectAmountInput,
          // expectedSetTokenAmount
        );
      });

      context("when input amount is 0", async () => {
        beforeEach(async () => {
          subjectAmountInput = ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("ExchangeIssuance: INVALID INPUTS");
        });
      });
    });

    describe("#issueSetForExactETH", async () => {
      let subjectSetToken: Address;
      let subjectAmountETHInput: BigNumber;
      let subjectMinSetReceive: BigNumber;

      beforeEach(async () => {
        // Deploy any required dependencies

        // subjectSetToken = ?
        // subjectAmountETHInput = ?
        // subjectMinSetReceive = ?
      });

      async function subject(): Promise<ContractTransaction> {
        return await exchangeIssuance.issueSetForExactETH(
          subjectSetToken,
          subjectMinSetReceive,
          { value: subjectAmountETHInput }
        );
      }

      it("should issue the correct amount of Set to the caller", async () => {
        // What state do you want to record before the test is run? (balance of the user of the Set)

        await subject();

        // What state do you want to verify against? (balance of the user of the Set)
        // Was this the expected amount?
      });

      it("should use the correct amount of ether from the caller", async () => {
        // What state do you want to record before the test is run? (ether balance of the caller)

        await subject();

        // What state do you want to verify against? (ether balance of the caller)
        // Was this the expected amount?
      });

      it("emits a ExchangeIssue log", async () => {
        // const expectedSetTokenAmount = calculate expected set token amount

        await expect(subject()).to.emit(exchangeIssuance, "ExchangeIssue").withArgs(
          subjectCaller,
          subjectSetToken,
          // ethAddress, (should we fetch the eth address from the contract)
          subjectAmountETHInput,
          // expectedSetTokenAmount
        );
      });

      context("when input ether amount is 0", async () => {
        beforeEach(async () => {
          subjectAmountETHInput = ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("ExchangeIssuance: INVALID INPUTS");
        });
      });
    });

    describe("#issueExactSetFromToken", async () => {
      let subjectSetToken: Address;
      let subjectInputToken: Address;
      let subjectMaxAmountInput: BigNumber;
      let subjectAmountSetToken: BigNumber;

      beforeEach(async () => {
        // Deploy any required dependencies

        // subjectSetToken = ?
        // subjectInputToken = ?
        // subjectMaxAmountInput = ?
        // subjectAmountSetToken = ?
      });

      async function subject(): Promise<ContractTransaction> {
        return await exchangeIssuance.issueExactSetFromToken(
          subjectSetToken,
          subjectInputToken,
          subjectAmountSetToken,
          subjectMaxAmountInput
        );
      }

      it("should issue the correct amount of Set to the caller", async () => {
        // What state do you want to record before the test is run? (balance of the user of the Set)

        await subject();

        // What state do you want to verify against? (difference in the balance of the Set equals subjectAmountSetToken)
      });

      it("should use the correct amount of input token from the caller", async () => {
        // What state do you want to record before the test is run? (balance of the input token of the caller)

        await subject();

        // What state do you want to verify against? (balance of the input token of the caller)
      });

      it("should return the correct amount of ether to the caller", async () => {
        // What state do you want to record before the test is run? (ether balance of the caller)

        await subject();

        // What state do you want to verify against? (ether balance of the caller)
      });


      it("emits a ExchangeIssue log", async () => {
        // const expectedSetTokenAmount = calculate expected set token amount

        await expect(subject()).to.emit(exchangeIssuance, "ExchangeIssue").withArgs(
          subjectCaller,
          subjectSetToken,
          subjectInputToken,
          subjectMaxAmountInput,
          subjectAmountSetToken
        );
      });

      context("when max input amount is 0", async () => {
        beforeEach(async () => {
          subjectMaxAmountInput = ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("ExchangeIssuance: INVALID INPUTS");
        });
      });

      context("when amount Set is 0", async () => {
        beforeEach(async () => {
          subjectAmountSetToken = ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("ExchangeIssuance: INVALID INPUTS");
        });
      });
    });

    describe("#issueExactSetFromETH", async () => {
      let subjectSetToken: Address;
      let subjectAmountETHInput: BigNumber;
      let subjectAmountSetToken: BigNumber;

      beforeEach(async () => {
        // Deploy any required dependencies

        // subjectSetToken = ?
        // subjectAmountETHInput = ?
        // subjectAmountSetToken = ?
      });

      async function subject(): Promise<ContractTransaction> {
        return await exchangeIssuance.issuesExactSetFromETH(
          subjectSetToken,
          subjectAmountSetToken,
          { value: subjectAmountSetToken }
        );
      }

      it("should issue the correct amount of Set to the caller", async () => {
        // What state do you want to record before the test is run? (balance of the user of the Set)

        await subject();

        // What state do you want to verify against? (difference in the balance of the Set equals subjectAmountSetToken)
      });

      it("should use the correct amount of ether from the caller", async () => {
        // What state do you want to record before the test is run? (ether balance of the caller)

        await subject();

        // Note: bot input amount and return amount need to be taken into account.
        // What state do you want to verify against? (ether balance of the caller)
      });

      it("emits a ExchangeIssue log", async () => {
        // const expectedSetTokenAmount = calculate expected set token amount

        await expect(subject()).to.emit(exchangeIssuance, "ExchangeIssue").withArgs(
          subjectCaller,
          subjectSetToken,
          // ether_address,
          subjectAmountETHInput,
          subjectAmountSetToken
        );
      });

      context("when input ether amount is 0", async () => {
        beforeEach(async () => {
          subjectAmountETHInput = ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("ExchangeIssuance: INVALID INPUTS");
        });
      });

      context("when amount Set is 0", async () => {
        beforeEach(async () => {
          subjectAmountSetToken = ZERO;
        });

        it("should revert", async () => {
          await expect(subject()).to.be.revertedWith("ExchangeIssuance: INVALID INPUTS");
        });
      });
    });
  });
});