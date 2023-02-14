import {evaluateStructures, includeCapital, SettlementData, Structure} from './structures';
import {structuresByName} from './structure-data';
import {ruleSchema} from './schema';

class StructureError extends Error {
}


function parseStructureData(name: string | null, data: unknown): Structure | undefined {
    if (data === undefined || data === null) {
        return undefined;
    } else if (typeof data === 'object' && 'ref' in data) {
        const refData = data as { ref: string };
        const lookedUpStructure = structuresByName.get(refData.ref);
        if (lookedUpStructure === undefined) {
            throw new StructureError(`No predefined structure data found for actor with name ${name}, aborting`);
        }
        return lookedUpStructure;
    } else if (name !== null) {
        const rule = {
            name,
            ...data,
        };
        const result = ruleSchema.validate(rule);
        if (result.error) {
            console.error(`Failed to validate structure with name ${name}`, data);
            console.error('Validation Error', result.error);
            throw new StructureError(`Structure with name ${name} failed to validate, aborting. See console log (F12) for more details`);
        }
        return rule;
    } else {
        return data as Structure;
    }
}

function getSceneStructures(scene: Scene): Structure[] {
    try {
        return scene.tokens
            .filter(t => t.actor !== null && t.actor !== undefined)
            .map(t => t.actor)
            .map(actor => parseStructureData(actor!.name, actor!.getFlag('pf2e-kingmaker-tools', 'structureData')))
            .filter(data => data !== undefined) as Structure[] ?? [];
    } catch (e: unknown) {
        if (e instanceof StructureError) {
            ui.notifications?.error(e.message);
        } else {
            throw e;
        }
    }
    return [];
}

export interface SceneSettlementData {
    settlementLevel: number;
    settlementType: string;
    overcrowded: boolean;
    secondaryTerritory: boolean;
}

export interface SceneData {
    name: string | null;
    id: string | null;
}

export interface CurrentSceneData extends SceneSettlementData, SceneData {
}

function getSceneData(scene: Scene): CurrentSceneData {
    const sceneData = scene.getFlag('pf2e-kingmaker-tools', 'settlementData') as SceneSettlementData | undefined;
    return {
        name: scene.name,
        id: scene.id,
        settlementLevel: sceneData?.settlementLevel ?? 1,
        settlementType: sceneData?.settlementType ?? '-',
        secondaryTerritory: sceneData?.secondaryTerritory ?? false,
        overcrowded: sceneData?.overcrowded ?? false,
    };
}

export async function saveViewedSceneData(game: Game, data: SceneSettlementData): Promise<void> {
    const viewed = game.scenes?.viewed;
    if (viewed) {
        await viewed.unsetFlag('pf2e-kingmaker-tools', 'settlementData');
        await viewed.setFlag('pf2e-kingmaker-tools', 'settlementData', data);
    }
}

function getCurrentScene(game: Game): Scene | undefined {
    return game.scenes?.viewed;
}

function getCapitalScene(game: Game): Scene | undefined {
    return game?.scenes?.find(scene => getSceneData(scene).settlementType === 'Capital');
}

export interface SettlementSceneData {
    settlement: SettlementData;
    scenedData: CurrentSceneData;
}

export function getMergedData(game: Game): SettlementSceneData | undefined {
    const capitalScene = getCapitalScene(game);
    const currentScene = getCurrentScene(game);
    if (capitalScene !== undefined && currentScene !== undefined && capitalScene.id !== currentScene.id) {
        const capitalSceneData = getSceneData(capitalScene);
        const capitalStructures = getSceneStructures(capitalScene);
        const capitalSettlement = evaluateStructures(capitalStructures, capitalSceneData.settlementLevel);
        const currentSceneData = getSceneData(currentScene);
        const currentStructures = getSceneStructures(currentScene);
        const currentSettlement = evaluateStructures(currentStructures, currentSceneData.settlementLevel);
        return {
            scenedData: currentSceneData,
            settlement: includeCapital(capitalSettlement, currentSettlement),
        };
    } else if (currentScene !== undefined) {
        const currentSceneData = getSceneData(currentScene);
        const currentStructures = getSceneStructures(currentScene);
        const currentSettlement = evaluateStructures(currentStructures, currentSceneData.settlementLevel);
        return {
            scenedData: currentSceneData,
            settlement: currentSettlement,
        };
    }
}

export function getSettlements(game: Game): SceneData[] {
    return game?.scenes
        ?.map(scene => getSceneData(scene))
        ?.filter(scene => {
            const settlementType = scene.settlementType;
            return settlementType === 'Settlement' || settlementType === 'Capital';
        }) ?? [];
}
