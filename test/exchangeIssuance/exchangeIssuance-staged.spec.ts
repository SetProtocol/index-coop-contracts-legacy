import "module-alias/register";

import { formatEther, parseEther, solidityKeccak256 } from "ethers/lib/utils";
import { Address, Account } from "@utils/types";
import { ADDRESS_ZERO, ZERO, ONE_DAY_IN_SECONDS, ONE_YEAR_IN_SECONDS, MAX_UINT_256, MAX_UINT_96, MAX_INT_256, ETH_ADDRESS } from "@utils/constants";
import { ExchangeIssuance, StandardTokenMock, UniswapV2Router02, WETH9 } from "@utils/contracts/index";
import { Controller, SetToken } from "@utils/contracts/setV2";
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
import { ethers } from "hardhat";

const expect = getWaffleExpect();

const getIssueSetForExactETH = async (setToken: SetToken, ethInput: BigNumber, uniswapRouter: UniswapV2Router02, weth: string) => {
  let sumEth = BigNumber.from(0);
  const amountEthForComponents = [];
  const components = await setToken.getComponents();
  for (let i = 0; i < components.length; i++) {
    const component = components[i];
    const unit = await setToken.getDefaultPositionRealUnit(component);
    sumEth = sumEth.add((await uniswapRouter.getAmountsIn(unit, [weth, component]))[0]);
    const amountEthForComponent = (await uniswapRouter.getAmountsIn(unit, [weth, component]))[0];
    amountEthForComponents.push(amountEthForComponent);
  }

  let expectedOutput: BigNumber = MAX_UINT_256;
  for (let i = 0; i < components.length; i++) {
    const component = components[i];
    const unit = await setToken.getDefaultPositionRealUnit(component);
    const scaledEth = amountEthForComponents[i].mul(ethInput).div(sumEth);
    const amountComponentOut = (await uniswapRouter.getAmountsOut(scaledEth, [weth, component]))[1];
    
    const potentialSetTokenOut = amountComponentOut.mul(ether(1)).div(unit);
    if (potentialSetTokenOut.lt(expectedOutput)) {
      expectedOutput = potentialSetTokenOut;
    }
  };
  return expectedOutput;
}

const getIssueSetForExactToken = async (setToken: SetToken, inputToken: string, inputAmount: BigNumber, 
  uniswapRouter: UniswapV2Router02, weth: string) => {
    // get eth amount that can be aquired with inputToken
    const ethInput = (await uniswapRouter.getAmountsOut(inputAmount, [inputToken, weth]))[1];
    return await getIssueSetForExactETH(setToken, ethInput, uniswapRouter, weth);
  }

describe("ExchangeIssuance", async () => {
  let owner: Account;
  let user: Account;
  let setV2Setup: SetFixture;

  let deployer: DeployHelper;
  let setToken: SetToken;

  let exchangeIssuance: ExchangeIssuance;

  before(async () => {
    [
      owner,
      user,
    ] = await getAccounts();

    deployer = new DeployHelper(owner.wallet);

    setV2Setup = getSetFixture(owner.address);
    await setV2Setup.initialize();

    setToken = await setV2Setup.createSetToken(
      [setV2Setup.dai.address, setV2Setup.wbtc.address],
      [ether(0.5), BigNumber.from(10).pow(8)],
      [setV2Setup.issuanceModule.address, setV2Setup.streamingFeeModule.address]
    );
    setV2Setup.issuanceModule.initialize(setToken.address, ADDRESS_ZERO);
  });

  addSnapshotBeforeRestoreAfterEach();

  describe("#constructor", async () => {
    let subjectWethAddress: Address;
    let subjectUniswapFactoryAddress: Address;
    let subjectUniswapRouter: UniswapV2Router02;
    let subjectSushiswapFactoryAddress: Address;
    let subjectSushiswapRouter: UniswapV2Router02;
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

      subjectWethAddress = wethAddress;
      subjectUniswapFactoryAddress = uniswapSetup.factory.address;
      subjectUniswapRouter = uniswapSetup.router;
      subjectSushiswapFactoryAddress = sushiswapSetup.factory.address;
      subjectSushiswapRouter = sushiswapSetup.router;
      subjectControllerAddress = setV2Setup.controller.address;
      subjectBasicIssuanceModuleAddress = setV2Setup.issuanceModule.address;
    });

    async function subject(): Promise<ExchangeIssuance> {
      return await deployer.adapters.deployExchangeIssuance(
        subjectWethAddress,
        subjectUniswapFactoryAddress,
        subjectUniswapRouter.address,
        subjectSushiswapFactoryAddress,
        subjectSushiswapRouter.address,
        subjectControllerAddress,
        subjectBasicIssuanceModuleAddress
      );
    }

    it("verify state set properly via constructor", async () => {
      const exchangeIssuanceContract: ExchangeIssuance = await subject();

      const expectedWethAddress = await exchangeIssuanceContract.WETH();
      expect(expectedWethAddress).to.eq(subjectWethAddress);

      const expectedUniRouterAddress = await exchangeIssuanceContract.uniRouter();
      expect(expectedUniRouterAddress).to.eq(subjectUniswapRouter.address);

      const expectedUniFactoryAddress = await exchangeIssuanceContract.uniFactory();
      expect(expectedUniFactoryAddress).to.eq(subjectUniswapFactoryAddress);

      const expectedSushiRouterAddress = await exchangeIssuanceContract.sushiRouter();
      expect(expectedSushiRouterAddress).to.eq(subjectSushiswapRouter.address);

      const expectedSushiFactoryAddress = await exchangeIssuanceContract.sushiFactory();
      expect(expectedSushiFactoryAddress).to.eq(subjectSushiswapFactoryAddress);

      const expectedControllerAddress = await exchangeIssuanceContract.setController();
      expect(expectedControllerAddress).to.eq(subjectControllerAddress);

      const expectedBasicIssuanceModuleAddress = await exchangeIssuanceContract.basicIssuanceModule();
      expect(expectedBasicIssuanceModuleAddress).to.eq(subjectBasicIssuanceModuleAddress);
    });

    it("approves WETH to the uniswap and sushiswap router", async () => {
      let exchangeIssuance: ExchangeIssuance = await subject();

      // validate the allowance of WETH between uniswap, sushiswap, and the deployed exchange issuance contract
      const uniswapWethAllowance = await setV2Setup.weth.allowance(exchangeIssuance.address, subjectUniswapRouter.address);
      expect(uniswapWethAllowance).to.eq(MAX_UINT_256);

      const sushiswapWethAllownace = await setV2Setup.weth.allowance(exchangeIssuance.address, subjectSushiswapRouter.address);
      expect(sushiswapWethAllownace).to.eq(MAX_UINT_256);
      
    });
  });

  context("when exchange issuance is deployed", async () => {
    let subjectWethAddress: Address;
    let subjectUniswapFactoryAddress: Address;
    let subjectUniswapRouter: UniswapV2Router02;
    let subjectSushiswapFactoryAddress: Address;
    let subjectSushiswapRouter: UniswapV2Router02;
    let subjectControllerAddress: Address;
    let subjectBasicIssuanceModuleAddress: Address;

    let weth: WETH9;
    let wbtc: StandardTokenMock;
    let dai: StandardTokenMock;
    let usdc: StandardTokenMock;

    beforeEach(async () => {
      let uniswapSetup: UniswapFixture;
      let sushiswapSetup: UniswapFixture;

      // TODO: should we instead port SystemFixtrue and use tokens from it ?
      weth = setV2Setup.weth;
      wbtc = setV2Setup.wbtc;
      dai = setV2Setup.dai;
      usdc = await deployer.setV2.deployTokenMock(user.address, 100000 * 10**6, 6, "USD Coin", "USDC")

      uniswapSetup = await getUniswapFixture(owner.address);
      await uniswapSetup.initialize(owner, weth.address, wbtc.address, dai.address);
      sushiswapSetup = await getUniswapFixture(owner.address);
      await sushiswapSetup.initialize(owner, weth.address, wbtc.address, dai.address);

      subjectWethAddress = weth.address;
      subjectUniswapFactoryAddress = uniswapSetup.factory.address;
      subjectUniswapRouter = uniswapSetup.router;
      subjectSushiswapFactoryAddress = sushiswapSetup.factory.address;
      subjectSushiswapRouter = sushiswapSetup.router;
      subjectControllerAddress = setV2Setup.controller.address;
      subjectBasicIssuanceModuleAddress = setV2Setup.issuanceModule.address;

      await uniswapSetup.createNewPair(weth.address, wbtc.address);
      await uniswapSetup.createNewPair(weth.address, dai.address);
      await uniswapSetup.createNewPair(weth.address, usdc.address);

      await wbtc.approve(subjectUniswapRouter.address, MAX_UINT_256);
      await subjectUniswapRouter.connect(owner.wallet).addLiquidityETH(
        wbtc.address, 
        ether(1),
        MAX_UINT_256,
        MAX_UINT_256, 
        owner.address,
        (await getLastBlockTimestamp()).add(1),
        { value: ether(100), gasLimit: 9000000 }
      );

      await dai.approve(subjectUniswapRouter.address, MAX_INT_256);
      await subjectUniswapRouter.connect(owner.wallet).addLiquidityETH(
        dai.address, 
        ether(100000),   
        MAX_UINT_256,
        MAX_UINT_256,
        owner.address,
        (await getLastBlockTimestamp()).add(1),
        { value: ether(10), gasLimit: 9000000 }
      );

      await usdc.connect(user.wallet).approve(subjectUniswapRouter.address, MAX_INT_256);
      await subjectUniswapRouter.connect(user.wallet).addLiquidityETH(
        usdc.address,
        10000 * 10**6,
        MAX_UINT_256, 
        MAX_UINT_256, 
        user.address, 
        (await getLastBlockTimestamp()).add(1),
        { value: ether(100), gasLimit: 9000000 }
      );
      
      exchangeIssuance = await deployer.adapters.deployExchangeIssuance(
        subjectWethAddress,
        subjectUniswapFactoryAddress,
        subjectUniswapRouter.address,
        subjectSushiswapFactoryAddress,
        subjectSushiswapRouter.address,
        subjectControllerAddress,
        subjectBasicIssuanceModuleAddress
      );
    });

    describe("#approveToken", async () => {
      let subjectTokenToApprove: StandardTokenMock;

      beforeEach(async () => {
        subjectTokenToApprove = setV2Setup.dai;
      });

      async function subject(): Promise<ContractTransaction> {
        return await exchangeIssuance.approveToken(subjectTokenToApprove.address);
      }

      it("should update the approvals correctly", async () => {
        const initUniswapDaiAllownace = await subjectTokenToApprove.allowance(exchangeIssuance.address, subjectUniswapRouter.address);
        const initSushiswapDaiAllownace = await subjectTokenToApprove.allowance(exchangeIssuance.address, subjectSushiswapRouter.address);
        const initIssuanceModuleDaiAllownace = await subjectTokenToApprove.allowance(exchangeIssuance.address, subjectBasicIssuanceModuleAddress);

        await subject();

        const finalUniswapDaiAllownace = await subjectTokenToApprove.allowance(exchangeIssuance.address, subjectUniswapRouter.address);
        const finalSushiswapDaiAllownace = await subjectTokenToApprove.allowance(exchangeIssuance.address, subjectSushiswapRouter.address);
        const finalIssuanceModuleDaiAllownace = await subjectTokenToApprove.allowance(exchangeIssuance.address, subjectBasicIssuanceModuleAddress);

        expect(finalUniswapDaiAllownace.sub(initUniswapDaiAllownace)).eq(MAX_UINT_96);
        expect(finalSushiswapDaiAllownace.sub(initSushiswapDaiAllownace)).eq(MAX_UINT_96);
        expect(finalIssuanceModuleDaiAllownace.sub(initIssuanceModuleDaiAllownace)).eq(MAX_UINT_96);
      });
    });

    describe("#approveTokens", async () => {
      let subjectTokensToApprove: StandardTokenMock[];

      beforeEach(async () => {
        subjectTokensToApprove = [setV2Setup.dai, setV2Setup.wbtc]
      });

      async function subject(): Promise<ContractTransaction> {
        return await exchangeIssuance.approveTokens(subjectTokensToApprove.map(token => token.address));
      }

      it("should update the approvals correctly", async () => {
        const token1 = subjectTokensToApprove[0];
        const initUniswapToken1Allownace = await token1.allowance(exchangeIssuance.address, subjectUniswapRouter.address);
        const initSushiswapToken1Allownace = await token1.allowance(exchangeIssuance.address, subjectSushiswapRouter.address);
        const initIssuanceModuleToken1Allownace = await token1.allowance(exchangeIssuance.address, subjectBasicIssuanceModuleAddress);

        const token2 = subjectTokensToApprove[1];
        const initUniswapToken2Allownace = await token2.allowance(exchangeIssuance.address, subjectUniswapRouter.address);
        const initSushiswapToken2Allownace = await token2.allowance(exchangeIssuance.address, subjectSushiswapRouter.address);
        const initIssuanceModuleToken2Allownace = await token2.allowance(exchangeIssuance.address, subjectBasicIssuanceModuleAddress);

        await subject();

        const finalUniswapToken1Allownace = await token1.allowance(exchangeIssuance.address, subjectUniswapRouter.address);
        const finalSushiswapToken1Allownace = await token1.allowance(exchangeIssuance.address, subjectSushiswapRouter.address);
        const finalIssuanceModuleToken1Allownace = await token1.allowance(exchangeIssuance.address, subjectBasicIssuanceModuleAddress);

        const finalUniswapToken2Allownace = await token2.allowance(exchangeIssuance.address, subjectUniswapRouter.address);
        const finalSushiswapToken2Allownace = await token2.allowance(exchangeIssuance.address, subjectSushiswapRouter.address);
        const finalIssuanceModuleToken2Allownace = await token2.allowance(exchangeIssuance.address, subjectBasicIssuanceModuleAddress);

        expect(finalUniswapToken1Allownace.sub(initUniswapToken1Allownace)).eq(MAX_UINT_96);
        expect(finalSushiswapToken1Allownace.sub(initSushiswapToken1Allownace)).eq(MAX_UINT_96);
        expect(finalIssuanceModuleToken1Allownace.sub(initIssuanceModuleToken1Allownace)).eq(MAX_UINT_96);

        expect(finalUniswapToken2Allownace.sub(initUniswapToken2Allownace)).eq(MAX_UINT_96);
        expect(finalSushiswapToken2Allownace.sub(initSushiswapToken2Allownace)).eq(MAX_UINT_96);
        expect(finalIssuanceModuleToken2Allownace.sub(initIssuanceModuleToken2Allownace)).eq(MAX_UINT_96);
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

    describe("#approveSetToken", async () => {
      let subjectSetToApprove: SetToken;
      let subjectToken1: StandardTokenMock;
      let subjectToken2: StandardTokenMock;

      beforeEach(async () => {
        subjectSetToApprove = setToken;
        subjectToken1 = setV2Setup.dai;
        subjectToken2 = setV2Setup.wbtc;
      });

      async function subject(): Promise<ContractTransaction> {
        return await exchangeIssuance.approveSetToken(subjectSetToApprove.address);
      }

      it("should update the approvals correctly", async () => {
        const initUniswapToken1Allownace = await subjectToken1.allowance(exchangeIssuance.address, subjectUniswapRouter.address);
        const initSushiswapToken1Allownace = await subjectToken1.allowance(exchangeIssuance.address, subjectSushiswapRouter.address);
        const initIssuanceModuleToken1Allownace = await subjectToken1.allowance(exchangeIssuance.address, subjectBasicIssuanceModuleAddress);

        const initUniswapToken2Allownace = await subjectToken2.allowance(exchangeIssuance.address, subjectUniswapRouter.address);
        const initSushiswapToken2Allownace = await subjectToken2.allowance(exchangeIssuance.address, subjectSushiswapRouter.address);
        const initIssuanceModuleToken2Allownace = await subjectToken2.allowance(exchangeIssuance.address, subjectBasicIssuanceModuleAddress);

        await subject();

        const finalUniswapToken1Allownace = await subjectToken1.allowance(exchangeIssuance.address, subjectUniswapRouter.address);
        const finalSushiswapToken1Allownace = await subjectToken1.allowance(exchangeIssuance.address, subjectSushiswapRouter.address);
        const finalIssuanceModuleToken1Allownace = await subjectToken1.allowance(exchangeIssuance.address, subjectBasicIssuanceModuleAddress);

        const finalUniswapToken2Allownace = await subjectToken2.allowance(exchangeIssuance.address, subjectUniswapRouter.address);
        const finalSushiswapToken2Allownace = await subjectToken2.allowance(exchangeIssuance.address, subjectSushiswapRouter.address);
        const finalIssuanceModuleToken2Allownace = await subjectToken2.allowance(exchangeIssuance.address, subjectBasicIssuanceModuleAddress);

        expect(finalUniswapToken1Allownace.sub(initUniswapToken1Allownace)).eq(MAX_UINT_96);
        expect(finalSushiswapToken1Allownace.sub(initSushiswapToken1Allownace)).eq(MAX_UINT_96);
        expect(finalIssuanceModuleToken1Allownace.sub(initIssuanceModuleToken1Allownace)).eq(MAX_UINT_96);

        expect(finalUniswapToken2Allownace.sub(initUniswapToken2Allownace)).eq(MAX_UINT_96);
        expect(finalSushiswapToken2Allownace.sub(initSushiswapToken2Allownace)).eq(MAX_UINT_96);
        expect(finalIssuanceModuleToken2Allownace.sub(initIssuanceModuleToken2Allownace)).eq(MAX_UINT_96);
      });
    });

    describe("#issueSetForExactToken", async () => {
      let subjectCaller: Account;
      let subjectSetToken: SetToken;
      let subjectInputToken: StandardTokenMock;
      let subjectAmountInput: BigNumber;
      let subjectMinSetReceive: BigNumber;

      beforeEach(async () => {
        // Deploy any required dependencies
        subjectCaller = user;
        subjectSetToken = setToken;
        subjectInputToken = usdc;
        subjectAmountInput = BigNumber.from(1000 * 10**6);
        subjectMinSetReceive = ether(0);
      });

      async function subject(): Promise<ContractTransaction> {
        await exchangeIssuance.approveSetToken(subjectSetToken.address);
        await subjectInputToken.connect(subjectCaller.wallet).approve(exchangeIssuance.address, MAX_UINT_256);
        return await exchangeIssuance.connect(subjectCaller.wallet).issueSetForExactToken(
          subjectSetToken.address,
          subjectInputToken.address,
          subjectAmountInput,
          subjectMinSetReceive,
          { gasLimit: 9000000 }
        );
      }

      it("should issue the correct amount of Set to the caller", async () => {
        // calculate amount set to be received
        const expectedOutput = await getIssueSetForExactToken(
          subjectSetToken, 
          subjectInputToken.address, 
          subjectAmountInput, 
          subjectUniswapRouter, 
          weth.address
        );

        // issue tokens
        const initSetBalance = await subjectSetToken.balanceOf(subjectCaller.address);
        await subject();
        const finalSetBalance = await subjectSetToken.balanceOf(subjectCaller.address);

        expect(expectedOutput).to.eq(finalSetBalance.sub(initSetBalance));
      });

      it("should use the correct amount of input token from the caller", async () => {
        const initTokenBalance = await subjectInputToken.balanceOf(subjectCaller.address);
        await subject();
        const finalTokenBalance = await subjectInputToken.balanceOf(subjectCaller.address);

        expect(subjectAmountInput).to.eq(initTokenBalance.sub(finalTokenBalance));
      });

      it("emits a ExchangeIssue log", async () => {
        const expectedSetTokenAmount = await getIssueSetForExactToken(
          subjectSetToken, 
          subjectInputToken.address, 
          subjectAmountInput, 
          subjectUniswapRouter, 
          weth.address
        );

        await expect(subject()).to.emit(exchangeIssuance, "ExchangeIssue").withArgs(
          subjectCaller.address,
          subjectSetToken.address,
          subjectInputToken.address,
          subjectAmountInput,
          expectedSetTokenAmount
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
      let subjectCaller: Account;
      let subjectSetToken: SetToken;
      let subjectAmountETHInput: BigNumber;
      let subjectMinSetReceive: BigNumber;

      beforeEach(async () => {
        subjectSetToken = setToken;
        subjectCaller = user;
        subjectAmountETHInput = ether(1);
        subjectMinSetReceive = ether(0);
      });

      async function subject(): Promise<ContractTransaction> {
        await exchangeIssuance.approveSetToken(subjectSetToken.address);
        return await exchangeIssuance.connect(subjectCaller.wallet).issueSetForExactETH(
          subjectSetToken.address,
          subjectMinSetReceive,
          { value: subjectAmountETHInput, gasPrice: 0 }
        );
      }

      it("should issue the correct amount of Set to the caller", async () => {
        // calculate expected set output
        const expectedOutput = await getIssueSetForExactETH(
          subjectSetToken,
          subjectAmountETHInput,
          subjectUniswapRouter,
          subjectWethAddress
        );
        
        // issue tokens
        const initSetBalance = await subjectSetToken.balanceOf(subjectCaller.address);
        await subject();
        const finalSetBalance = await subjectSetToken.balanceOf(subjectCaller.address);

        expect(expectedOutput).to.eq(finalSetBalance.sub(initSetBalance));
      });

      it("should use the correct amount of ether from the caller", async () => {
        const initEthBalance = await user.wallet.getBalance();
        await subject();
        const finalEthBalance = await user.wallet.getBalance();

        expect(subjectAmountETHInput).to.eq((await initEthBalance).sub(finalEthBalance))
      });

      it("emits a ExchangeIssue log", async () => {
        const expectedSetTokenAmount = await getIssueSetForExactETH(
          subjectSetToken,
          subjectAmountETHInput,
          subjectUniswapRouter,
          subjectWethAddress
        );
        await expect(subject()).to.emit(exchangeIssuance, "ExchangeIssue").withArgs(
          subjectCaller.address,
          subjectSetToken.address,
          ETH_ADDRESS,
          subjectAmountETHInput,
          expectedSetTokenAmount
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
      let subjectCaller: Address;
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
      let subjectCaller: Address;
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