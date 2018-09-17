import { Yok } from "../../../lib/common/yok";
import { PreviewAppPluginsService } from "../../../lib/services/livesync/playground/preview-app-plugins-service";
import { Device } from "nativescript-preview-sdk";
import { assert } from "chai";
import * as util from "util";
import { PluginComparisonMessages } from "../../../lib/services/livesync/playground/preview-app-constants";

let readJsonParams: string[] = [];
let warnParams: string[] = [];

function createTestInjector(localPlugins: IStringDictionary): IInjector {
	const injector = new Yok();
	injector.register("fs", {
		readJson: (filePath: string) => {
			readJsonParams.push(filePath);
			return {
				dependencies: localPlugins
			};
		}
	});
	injector.register("logger", {
		trace: () => ({}),
		warn: (message: string) =>  warnParams.push(message)
	});
	injector.register("projectData", {
		projectDir: "testProjectDir"
	});
	injector.register("previewAppPluginsService", PreviewAppPluginsService);
	return injector;
}

const deviceId = "myTestDeviceId";

function createDevice(plugins: string): Device {
	return {
		id: deviceId,
		platform: "iOS",
		model: "myTestDeviceModel",
		name: "myTestDeviceName",
		osVersion: "10.0",
		previewAppVersion: "28.0.0",
		runtimeVersion: "4.3.0",
		plugins,
		pluginsExpanded: false
	};
}

function setup(localPlugins: IStringDictionary, previewAppPlugins: IStringDictionary): any {
	const injector = createTestInjector(localPlugins);
	const previewAppPluginsService = injector.resolve("previewAppPluginsService");
	const device = createDevice(JSON.stringify(previewAppPlugins));

	return {
		previewAppPluginsService,
		device
	};
}

describe("previewAppPluginsService", () => {
	describe("comparePluginsOnDevice", () => {
		it("should persist warnings per preview app's version", async () => {
			const localPlugins = {
				"nativescript-facebook": "2.2.3",
				"nativescript-theme-core": "1.0.4",
				"tns-core-modules": "4.2.0"
			};
			const previewAppPlugins = {
				"nativescript-theme-core": "2.0.4",
				"tns-core-modules": "4.2.0"
			};
			const injector = createTestInjector(localPlugins);
			const previewAppPluginsService = injector.resolve("previewAppPluginsService");

			let isGetDevicePluginsCalled = false;
			const originalGetDevicePlugins = (<any>previewAppPluginsService).getDevicePlugins;
			(<any>previewAppPluginsService).getDevicePlugins = (device: Device) => {
				isGetDevicePluginsCalled = true;
				return originalGetDevicePlugins(device);
			};
			let isGetLocalPluginsCalled = false;
			const originalGetLocalPlugins = (<any>previewAppPluginsService).getLocalPlugins;
			(<any>previewAppPluginsService).getLocalPlugins = () => {
				isGetLocalPluginsCalled = true;
				return originalGetLocalPlugins.apply(previewAppPluginsService);
			};

			await previewAppPluginsService.comparePluginsOnDevice(createDevice(JSON.stringify(previewAppPlugins)));

			const expectedWarnings = [
				util.format(PluginComparisonMessages.PLUGIN_NOT_INCLUDED_IN_PREVIEW_APP, "nativescript-facebook", deviceId),
				util.format(PluginComparisonMessages.LOCAL_PLUGIN_WITH_DIFFERENCE_IN_MAJOR_VERSION, "nativescript-theme-core", "1.0.4", "2.0.4")
			];
			assert.isTrue(isGetDevicePluginsCalled);
			assert.isTrue(isGetLocalPluginsCalled);
			assert.deepEqual(warnParams, expectedWarnings);

			isGetDevicePluginsCalled = false;
			isGetLocalPluginsCalled = false;
			warnParams = [];

			await previewAppPluginsService.comparePluginsOnDevice(createDevice(JSON.stringify(previewAppPlugins)));

			assert.isFalse(isGetDevicePluginsCalled);
			assert.isFalse(isGetLocalPluginsCalled);
			assert.deepEqual(warnParams, expectedWarnings);
		});

		const testCases = [
			{
				name: "should show warning for plugin not included in preview app",
				localPlugins: {
					"nativescript-facebook": "2.2.3",
					"nativescript-theme-core": "~1.0.4",
					"tns-core-modules": "~4.2.0"
				},
				previewAppPlugins: {
					"nativescript-theme-core": "~1.0.4",
					"tns-core-modules": "~4.2.0"
				},
				expectedWarnings: [
					util.format(PluginComparisonMessages.PLUGIN_NOT_INCLUDED_IN_PREVIEW_APP, "nativescript-facebook", deviceId)
				]
			},
			{
				name: "should show warnings for plugins not included in preview app",
				localPlugins: {
					"nativescript-facebook": "2.2.3",
					"nativescript-theme-core": "~1.0.4",
					"tns-core-modules": "~4.2.0"
				},
				previewAppPlugins: {
				},
				expectedWarnings: [
					util.format(PluginComparisonMessages.PLUGIN_NOT_INCLUDED_IN_PREVIEW_APP, "nativescript-facebook", deviceId),
					util.format(PluginComparisonMessages.PLUGIN_NOT_INCLUDED_IN_PREVIEW_APP, "nativescript-theme-core", deviceId),
					util.format(PluginComparisonMessages.PLUGIN_NOT_INCLUDED_IN_PREVIEW_APP, "tns-core-modules", deviceId)
				]
			},
			{
				name: "should not show warnings when all plugins are included in preview app",
				localPlugins: {
					"nativescript-theme-core": "1.0.4",
					"nativescript-facebook": "2.2.3"
				},
				previewAppPlugins: {
					"nativescript-theme-core": "1.1.4",
					"nativescript-facebook": "2.2.3"
				},
				expectedWarnings: <string[]>[]
			},
			{
				name: "should show warning when local plugin has lower major version",
				localPlugins: {
					"nativescript-theme-core": "2.0.0"
				},
				previewAppPlugins: {
					"nativescript-theme-core": "3.4.0"
				},
				expectedWarnings: [
					util.format(PluginComparisonMessages.LOCAL_PLUGIN_WITH_DIFFERENCE_IN_MAJOR_VERSION, "nativescript-theme-core", "2.0.0", "3.4.0")
				]
			},
			{
				name: "should show warning when local plugin has greater major version",
				localPlugins: {
					"nativescript-theme-core": "4.0.0"
				},
				previewAppPlugins: {
					"nativescript-theme-core": "3.0.0"
				},
				expectedWarnings: [
					util.format(PluginComparisonMessages.LOCAL_PLUGIN_WITH_DIFFERENCE_IN_MAJOR_VERSION, "nativescript-theme-core", "4.0.0", "3.0.0")
				]
			},
			{
				name: "should show warning when local plugin has greater minor version and the same major version",
				localPlugins: {
					"nativescript-theme-core": "3.5.0"
				},
				previewAppPlugins: {
					"nativescript-theme-core": "3.0.0"
				},
				expectedWarnings: [
					util.format(PluginComparisonMessages.LOCAL_PLUGIN_WITH_GREATHER_MINOR_VERSION, "nativescript-theme-core", "3.5.0", "3.0.0")
				]
			},
			{
				name: "should not show warning when local plugin has lower minor version and the same major version",
				localPlugins: {
					"nativescript-theme-core": "3.1.0"
				},
				previewAppPlugins: {
					"nativescript-theme-core": "3.2.0"
				},
				expectedWarnings: []
			},
			{
				name: "should not show warning when plugins differ only in patch versions (lower local patch version)",
				localPlugins: {
					"nativescript-theme-core": "3.5.0"
				},
				previewAppPlugins: {
					"nativescript-theme-core": "3.5.1"
				},
				expectedWarnings: []
			},
			{
				name: "should not show warning when plugins differ only in patch versions (greater local patch version)",
				localPlugins: {
					"nativescript-theme-core": "3.5.1"
				},
				previewAppPlugins: {
					"nativescript-theme-core": "3.5.0"
				},
				expectedWarnings: []
			}
		];

		afterEach(() => {
			warnParams = [];
			readJsonParams = [];
		});

		for (const testCase of testCases) {
			it(`${testCase.name}`, async () => {
				const { previewAppPluginsService, device } = setup(testCase.localPlugins, testCase.previewAppPlugins);

				await previewAppPluginsService.comparePluginsOnDevice(device);

				assert.equal(warnParams.length, testCase.expectedWarnings.length);
				testCase.expectedWarnings.forEach(warning => assert.include(warnParams, warning));
			});
		}
	});
	describe("getExternalPlugins", () => {
		const testCases = [
			{
				name: "should return default plugins(`tns-core-modules` and `tns-core-modules-widgets`) when no plugins are provided",
				plugins: {},
				expectedPlugins: ["tns-core-modules", "tns-core-modules-widgets"]
			},
			{
				name: "should exclude `nativescript-vue`",
				plugins: { "nativescript-vue": "1.2.3" },
				expectedPlugins: ["tns-core-modules", "tns-core-modules-widgets"]
			},
			{
				name: "should exclude `nativescript-intl`",
				plugins: { "nativescript-intl": "4.5.6" },
				expectedPlugins: ["tns-core-modules", "tns-core-modules-widgets"]
			},
			{
				name: "should exclude `nativescript-angular`",
				plugins: { "nativescript-angular": "7.8.9" },
				expectedPlugins: ["tns-core-modules", "tns-core-modules-widgets"]
			},
			{
				name: "should exclude `nativescript-theme-core`",
				plugins: { "nativescript-theme-core": "1.3.5" },
				expectedPlugins: ["tns-core-modules", "tns-core-modules-widgets"]
			},
			{
				name: "should return plugins that contain `nativescript` in their names",
				plugins: {
					"nativescript-facebook": "4.5.6"
				},
				expectedPlugins: ["nativescript-facebook", "tns-core-modules", "tns-core-modules-widgets"]
			},
			{
				name: "should not return plugins that do not contain `nativescript` in their names",
				plugins: {
					lodash: "4.5.6",
					xmlhttprequest: "1.2.3"
				},
				expectedPlugins: ["tns-core-modules", "tns-core-modules-widgets"]
			}
		];

		_.each(testCases, testCase => {
			it(`${testCase.name}`, () => {
				const { previewAppPluginsService, device } = setup(testCase.plugins, testCase.plugins);
				const actualPlugins = previewAppPluginsService.getExternalPlugins(device);
				assert.deepEqual(actualPlugins, testCase.expectedPlugins);
			});
		});
	});
});