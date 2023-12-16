import styled from 'styled-components';
import { useEffect, useState } from 'react';
import Button from '@material-ui/core/Button';
import { CircularProgress } from '@material-ui/core';
import { GatewayStatus, useGateway } from '@civic/solana-gateway-react';
import { CandyMachine } from './candy-machine';



export const MultiMintButton = ({
    onMint,
    candyMachine,
    isMinting,
    isEnded,
    isActive,
    isSoldOut,
    price
}: {
    onMint: (quantityString: number) => Promise<void>;
    candyMachine: CandyMachine | undefined;
    isMinting: boolean;
    isEnded: boolean;
    isActive: boolean;
    isSoldOut: boolean;
    price: number;
}) => {
    const { requestGatewayToken, gatewayStatus } = useGateway();
    const [clicked, setClicked] = useState(false);
    const [isVerifying, setIsVerifying] = useState(false);
    const [mintCount, setMintCount] = useState(1);
    const [totalCost, setTotalCost] = useState(mintCount * (price + 0.012));

    useEffect(() => {
        setIsVerifying(false);
        if (gatewayStatus === GatewayStatus.COLLECTING_USER_INFORMATION && clicked) {
            // when user approves wallet verification txn
            setIsVerifying(true);
        } else if (gatewayStatus === GatewayStatus.ACTIVE && clicked) {
            console.log('Verified human, now minting...');
            onMint(mintCount);
            setClicked(false);
        }
    }, [gatewayStatus, clicked, setClicked, mintCount, setMintCount, onMint]);

    function incrementValue() {
        var numericField = document.querySelector(".mint-qty") as HTMLInputElement;
        if (numericField) {
            var value = parseInt(numericField.value);
            if (!isNaN(value) && value < 50) {
                value++;
                numericField.value = "" + value;
                updateAmounts(value);
            }
        }
    }

    function decrementValue() {
        var numericField = document.querySelector(".mint-qty") as HTMLInputElement;
        if (numericField) {
            var value = parseInt(numericField.value);
            if (!isNaN(value) && value > 1) {
                value--;
                numericField.value = "" + value;
                updateAmounts(value);
            }
        }
    }

    function updateMintCount(target: any) {
        var value = parseInt(target.value);
        if (!isNaN(value)) {
            if (value > 10) {
                value = 10;
                target.value = "" + value;
            } else if (value < 1) {
                value = 1;
                target.value = "" + value;
            }
            updateAmounts(value);
        }
    }

    function updateAmounts(qty: number) {
        setMintCount(qty);
        setTotalCost(Math.round(qty * (price + 0.012) * 1000) / 1000);  // 0.012 = approx of account creation fees
    }


    return (
        <div>
            <div className='MultiMintSection'>

                <div className='QtySection'>
                    <button className='Minus'
                        disabled={
                            clicked ||
                            candyMachine?.state.isSoldOut ||
                            isSoldOut ||
                            isMinting ||
                            isEnded ||
                            !isActive ||
                            isVerifying
                        }
                        onClick={() => decrementValue()}
                    >-</button>
                    <input
                        disabled={
                            true
                        }
                        type="number"
                        className="mint-qty"
                        step={1}
                        min={1}
                        max={10}
                        value={mintCount}
                        onChange={(e) => updateMintCount((e.target as any))}
                    />
                    <button className='Minus'
                        disabled={
                            clicked ||
                            candyMachine?.state.isSoldOut ||
                            isSoldOut ||
                            isMinting ||
                            isEnded ||
                            !isActive ||
                            isVerifying
                        }
                        onClick={() => incrementValue()}
                    >+</button>
                </div>
                <button className='CTAButton'
                    disabled={
                        clicked ||
                        candyMachine?.state.isSoldOut ||
                        isSoldOut ||
                        isMinting ||
                        isEnded ||
                        !isActive ||
                        isVerifying
                    }
                    onClick={async () => {
                        if (isActive && candyMachine?.state.gatekeeper && gatewayStatus !== GatewayStatus.ACTIVE) {
                            console.log('Requesting gateway token');
                            setClicked(true);
                            await requestGatewayToken();
                        } else {
                            console.log('Minting...');
                            await onMint(mintCount);
                        }
                    }}

                >
                    {!candyMachine ? (
                        "CONNECTING..."
                    ) : candyMachine?.state.isSoldOut || isSoldOut ? (
                        'SOLD OUT'
                    ) : isActive ? (
                        isVerifying ? 'VERIFYING...' :
                            isMinting || clicked ? (
                                <CircularProgress />
                            ) : (
                                `MINT ${mintCount}`
                            )
                    ) : isEnded ? "ENDED" : (candyMachine?.state.goLiveDate ? (
                        "SOON"
                    ) : (
                        "UNAVAILABLE"
                    ))}
                </button>
            </div>
            {/* {!candyMachine?.state.isSoldOut && !isSoldOut && isActive &&
                <h3>Total estimated cost (Solana fees included) : {totalCost} SOL</h3>} */}
        </div>
    );
};
